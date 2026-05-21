import { OAuth2Server } from "oauth2-mock-server";
import { DeepAlphaClient, DeepAlphaApiError } from "./public_api/client.ts";
import {
    pickerPage,
    resultPage,
    logPage,
    dashboardPage,
    commRowHtml,
    type ImaginaryClient,
    type ResultBlocks,
} from "./templates.ts";
import { listSessionsForInvestorEmail, recordOtherCall, recordSessionCall, listComm, completedSessionIds, logComm } from "./db.ts";
import { subscribe } from "./comm-stream.ts";
import { handleReport } from "./report.ts";

const PORT = 9090;
const OAUTH_PORT = 9091;
const PUBLIC_ISSUER_URL = Bun.env.PUBLIC_ISSUER_URL ?? `http://localhost:${PORT}`;
const SESSION_HOST = "qf-employee-bjornar.test.deepalpha.dev";

const CLIENT_ID = Bun.env.CLIENT_ID;
const CLIENT_SECRET = Bun.env.CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("Missing CLIENT_ID / CLIENT_SECRET in .env");
    process.exit(1);
}

const client = new DeepAlphaClient({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });

const USERS = [
    {
        sub: "quantfolio.a1b2c3d4-1234-5678-abcd-ef0123456789",
        email: "alice@quantfol.io",
        email_verified: true,
        name: "Alice Andersen",
        preferred_username: "Alice",
        roles: ["advisor"],
    },
    {
        sub: "quantfolio.deadbeef-cafe-babe-feed-c0ffee123456",
        email: "bob@quantfol.io",
        email_verified: true,
        name: "Bob Bergström",
        preferred_username: "Bob",
        roles: ["advisor"],
    },
    {
        sub: "quantfolio.deadbeef-cafe-babe-feed-tea123456",
        email: "claire@quantfol.io",
        email_verified: true,
        name: "Claire Bertlelsen",
        preferred_username: "Claire",
        roles: ["advisor"],
    },
];

const IMAGINARY_CLIENTS: ImaginaryClient[] = [
    { name: "Erik Larsen", email: "erik.larsen@example.com", country: "NO" },
    { name: "Maria Svensson", email: "maria.svensson@example.com", country: "SE" },
    { name: "Hans Müller", email: "hans.mueller@example.com", country: "DE" },
    { name: "Sofia Lindqvist", email: "sofia.lindqvist@example.com", country: "SE" },
    { name: "Jan de Vries", email: "jan.devries@example.com", country: "NL" },
];

const getUserByIndex = (idx: number) => USERS[idx] ?? USERS[0]!;
const getUserBySub = (sub: string) => USERS.find(u => u.sub === sub) ?? USERS[0]!;

const codeToUser = new Map<string, number>();

// ── oauth2-mock-server ────────────────────────────────────────────────────────

const server = new OAuth2Server();
await server.issuer.keys.generate("RS256");
server.issuer.url = PUBLIC_ISSUER_URL;

server.service.on("beforeAuthorizeRedirect", (redirectUri: any, req: any) => {
    const code = redirectUri.url?.searchParams?.get("code");
    const idx = parseInt(req.query?.user ?? "0", 10);
    if (code) codeToUser.set(code, idx);
    console.log(`[auth] code ${code} → user[${idx}] ${getUserByIndex(idx).name}`);
});

server.service.on("beforeTokenSigning", (token: any, req: any) => {
    const code = req.body?.code;
    const idx = codeToUser.get(code) ?? 0;
    const user = getUserByIndex(idx);
    console.log(user);
    console.log(`[token] signing for ${user.name}`);

    Object.assign(token.payload, {
        sub: user.sub,
        email: user.email,
        email_verified: user.email_verified,
        name: user.name,
        preferred_username: user.preferred_username,
        roles: user.roles,
    });
});

(server.service as any).on("beforeUserinfo", (res: any, req: any) => {
    console.log("[userinfo] req.auth:", req.auth);
    console.log("[userinfo] authorization header:", req.headers?.authorization);

    let sub: string | undefined;
    try {
        const bearer = req.headers?.authorization?.replace("Bearer ", "");
        if (bearer) {
            const payload = JSON.parse(Buffer.from(bearer.split(".")[1], "base64url").toString());
            sub = payload.sub;
            console.log("[userinfo] decoded sub:", sub);
        }
    } catch (e) {
        console.log("[userinfo] failed to decode token:", e);
    }

    const user = sub ? getUserBySub(sub) : getUserByIndex(0);
    console.log("[userinfo] serving user:", user.name);

    Object.assign(res.body, {
        sub: user.sub,
        email: user.email,
        email_verified: user.email_verified,
        name: user.name,
        preferred_username: user.preferred_username,
    });
});

await server.start(OAUTH_PORT, "localhost");

// ── Mock SSO debug page ───────────────────────────────────────────────────────

const debugPage = (tokens: any, decodedIdToken: any) => /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Mock SSO — Debug</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
       background:#f0f2f5;min-height:100vh;padding:32px;color:#111}
  .card{background:#fff;border-radius:14px;padding:32px;max-width:820px;margin:0 auto;
        box-shadow:0 4px 32px rgba(0,0,0,.1)}
  h1{font-size:22px;margin-bottom:6px}
  .sub{font-size:13px;color:#999;margin-bottom:20px}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;
     margin:18px 0 8px}
  pre{background:#0f172a;color:#e2e8f0;border-radius:8px;padding:14px;
      font-size:12px;line-height:1.55;overflow:auto;word-break:break-all;white-space:pre-wrap}
</style>
</head>
<body>
<div class="card">
  <h1>✅ Authentication successful</h1>
  <p class="sub">Token exchange completed against the mock OAuth server.</p>
  <h2>Token response</h2>
  <pre>${JSON.stringify(tokens, null, 2)}</pre>
  ${decodedIdToken ? `<h2>Decoded id_token</h2><pre>${JSON.stringify(decodedIdToken, null, 2)}</pre>` : ""}
</div>
</body>
</html>`;

// ── select-and-lookup handlers ───────────────────────────────────────────────

let lastPickedUserIdx: number | undefined;

async function handlePick(idx: number): Promise<Response> {
    const user = USERS[idx];
    if (!user) {
        return new Response("Unknown user index", { status: 400 });
    }

    lastPickedUserIdx = idx;
    const saved = { sub: user.sub, email: user.email, name: user.name };
    console.log(`[pick] saved (lastPickedUserIdx=${idx}):`, saved);

    const blocks: ResultBlocks = { user: saved, advisorLookup: null };

    try {
        const listAdvisorsReq = { email: user.email };
        const advisorRes = (await client.listAdvisors(listAdvisorsReq)) as {
            advisors?: Array<{ advisor_id?: string }>;
        };
        recordOtherCall({}, "GET /v1/advisor", listAdvisorsReq, advisorRes);
        blocks.advisorLookup = advisorRes;
        const matched = advisorRes?.advisors?.[0];
        console.log(`[pick] /v1/advisor returned ${advisorRes?.advisors?.length ?? 0} match(es)`);

        if (matched?.advisor_id) {
            blocks.advisorId = matched.advisor_id;
            const advisorId = matched.advisor_id;
            blocks.clients = IMAGINARY_CLIENTS.map((c) => ({
                ...c,
                sessions: listSessionsForInvestorEmail(advisorId, c.email),
            }));
            console.log(`[pick] saved advisor_id=${matched.advisor_id}`);
        } else {
            console.log("[pick] no advisor → creating investor");
            const createInvestorReq = {
                name: user.name,
                email: user.email,
                country: "NO",
                investorType: "person",
            };
            const created = (await client.createInvestor(createInvestorReq)) as { id?: string };
            recordOtherCall(
                { investorId: created.id },
                "POST /v1/investor",
                createInvestorReq,
                created,
            );
            blocks.investorCreated = created;
            console.log("[pick] /v1/investor response:", created);
        }
    } catch (e) {
        if (e instanceof DeepAlphaApiError) {
            blocks.error = { status: e.status, message: e.message, body: e.body };
        } else {
            blocks.error = { message: e instanceof Error ? e.message : String(e) };
        }
        console.error("[pick] error:", blocks.error);
    }

    return new Response(resultPage(blocks), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
    });
}

function rewriteHost(rawUrl: string): string {
    try {
        const u = new URL(rawUrl);
        u.hostname = SESSION_HOST;
        u.port = "";
        return u.toString();
    } catch {
        return rawUrl;
    }
}

function pickFirstUrl(value: unknown): string | undefined {
    if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
    if (value && typeof value === "object") {
        for (const v of Object.values(value as Record<string, unknown>)) {
            const found = pickFirstUrl(v);
            if (found) return found;
        }
    }
    return undefined;
}

interface SessionRequestBody {
    advisorId?: string;
    name?: string;
    email?: string;
    country?: string;
}

async function handleCreateSession(body: SessionRequestBody): Promise<Response> {
    const { advisorId, name, email, country } = body;
    if (!advisorId || !email || !name) {
        return Response.json({ status: "error", message: "missing advisorId/email/name" }, { status: 400 });
    }

    try {
        console.log(`[session] checking investors for advisor ${advisorId} with email ${email}`);
        const listInvestorsReq = { advisorId, pageSize: 100 };
        const investorsRes = (await client.listInvestors(listInvestorsReq)) as {
            investors?: Array<{ id?: string; email?: string; name?: string }>;
        };
        recordOtherCall(
            { advisorId },
            "GET /v1/investor",
            listInvestorsReq,
            investorsRes,
        );
        const targetEmail = email.toLowerCase();
        let investorId = investorsRes?.investors?.find(
            (i) => (i.email ?? "").toLowerCase() === targetEmail,
        )?.id;
        let createdInvestor: unknown;

        if (!investorId) {
            console.log(`[session] no investor with email=${email} under this advisor → creating`);
            const createInvestorReq = {
                name,
                email,
                country: country || "NO",
                investorType: "person",
                advisorId,
            };
            const newInvestor = (await client.createInvestor(createInvestorReq)) as { id?: string };
            recordOtherCall(
                { advisorId, investorId: newInvestor.id },
                "POST /v1/investor",
                createInvestorReq,
                newInvestor,
            );
            createdInvestor = newInvestor;
            investorId = newInvestor.id;
            if (!investorId) {
                return Response.json(
                    { status: "error", message: "createInvestor did not return an id", body: newInvestor },
                    { status: 500 },
                );
            }
            console.log(`[session] new investor id=${investorId}`);
        } else {
            console.log(`[session] existing investor id=${investorId}`);
        }

        console.log(`[session] POST /v1/state_session for investor ${investorId}`);
        const createSessionReq = {
            advisor_id: advisorId,
            investor_id: investorId,
            name: `Session for ${name} @ ${new Date().toISOString()}`,
            advice_type: "MiFIID II investment Advice",
        };
        const created = (await client.createStateSession(createSessionReq as never)) as {
            session_id?: string;
            links?: unknown;
        };
        const rawLink = pickFirstUrl(created.links);
        const sessionUrl = rawLink
            ? rewriteHost(rawLink)
            : `https://${SESSION_HOST}/?session_id=${created.session_id ?? ""}`;

        recordOtherCall(
            { advisorId, investorId },
            "POST /v1/state_session",
            createSessionReq,
            created,
            { sessionUrl },
        );

        console.log(`[session] created session_id=${created.session_id}, url=${sessionUrl}`);

        return Response.json({
            status: "ok",
            sessionId: created.session_id,
            sessionUrl,
            investorCreated: createdInvestor !== undefined,
            rawResponse: created,
        });
    } catch (e) {
        const err =
            e instanceof DeepAlphaApiError
                ? { status: "error", code: e.status, message: e.message, body: e.body }
                : { status: "error", message: e instanceof Error ? e.message : String(e) };
        console.error("[session] error:", err);
        return Response.json(err, { status: 500 });
    }
}

interface WebhookEvent {
    type?: string;
    object_id?: string;
    object_owner_id?: string;
}

async function fetchSessionBundle(sessionId: string) {
    const getAdviceSessionRes = await client.getAdviceSession(sessionId);
    recordSessionCall(
        sessionId,
        "GET /v2/advice_session/{session_id}",
        { sessionId },
        getAdviceSessionRes,
    );

    const getAdviceInformationRes = await client.getAdviceInformation(sessionId);
    recordSessionCall(
        sessionId,
        "GET /v2/advice_session/{session_id}/advice_information",
        { sessionId },
        getAdviceInformationRes,
    );

    const listAdviceGoalsRes = await client.listAdviceGoals(sessionId);
    recordSessionCall(
        sessionId,
        "GET /v2/advice_session/{session_id}/goal",
        { sessionId },
        listAdviceGoalsRes,
    );

    const getAdviceTransactionsRes = await client.getAdviceTransactions(sessionId);
    recordSessionCall(
        sessionId,
        "GET /v2/advice_session/{session_id}/transactions",
        { sessionId },
        getAdviceTransactionsRes,
    );

    const goalItems: unknown[] = Array.isArray(listAdviceGoalsRes)
        ? listAdviceGoalsRes
        : (listAdviceGoalsRes as { data?: unknown[]; goals?: unknown[] })?.data
          ?? (listAdviceGoalsRes as { data?: unknown[]; goals?: unknown[] })?.goals
          ?? [];
    const goalIds = goalItems
        .map((g) => {
            const obj = g as Record<string, unknown>;
            return (obj.id ?? obj.goal_id) as string | undefined;
        })
        .filter((id): id is string => typeof id === "string" && id.length > 0);

    const goalDetails = await Promise.all(
        goalIds.map(async (goalId) => {
            const detail = await client.getAdviceGoal(sessionId, goalId);
            recordSessionCall(
                sessionId,
                "GET /v2/advice_session/{session_id}/goal/{goal_id}",
                { sessionId, goalId },
                detail,
            );
            return { goal_id: goalId, detail };
        }),
    );

    return {
        session: getAdviceSessionRes,
        advice_information: getAdviceInformationRes,
        goals: listAdviceGoalsRes,
        goal_details: goalDetails,
        transactions: getAdviceTransactionsRes,
    };
}

async function handleSessionCompleted(sessionId: string, investorId: string) {
    console.log(`[listener] session.completed session_id=${sessionId} investor_id=${investorId}`);

    await fetchSessionBundle(sessionId);

    const reportMeta = (await client.getReport(investorId, sessionId)) as {
        data?: Array<{ documentId?: string; documentType?: string }>;
    };
    recordSessionCall(
        sessionId,
        "GET /v1/report/{investor_id}/{session_id}",
        { investorId, sessionId },
        reportMeta,
    );

    const files = (reportMeta.data ?? [])
        .filter((f) => typeof f.documentId === "string" && typeof f.documentType === "string")
        .map((f) => ({ documentId: f.documentId!, documentType: f.documentType! }));
    if (files.length === 0) {
        console.warn(`[listener] no report files for session ${sessionId}; skipping PDF`);
        return;
    }

    const downloadReq = { investorId, sessionId, files };
    const pdfRes = await client.downloadReportPdf(investorId, sessionId, { files });
    const pdfPath = `session_${sessionId}.pdf`;
    await Bun.write(pdfPath, pdfRes);
    const sizeBytes = Bun.file(pdfPath).size;
    recordSessionCall(
        sessionId,
        "POST /v1/report/{investor_id}/{session_id}/download",
        downloadReq,
        { path: pdfPath, size_bytes: sizeBytes },
    );
    console.log(`[listener] saved ${pdfPath} (${sizeBytes} bytes)`);
}

async function handleListener(req: Request): Promise<Response> {
    const contentType = req.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
        ? await req.json().catch(() => null)
        : await req.text();

    const echo = {
        method: req.method,
        url: req.url,
        headers: Object.fromEntries(req.headers),
        body,
    };
    console.log("[listener]", JSON.stringify(echo, null, 2));

    const webhookEvent = body as WebhookEvent | null;
    logComm({
        kind: "webhook_in",
        label: webhookEvent?.type ?? "(webhook)",
        sessionId: typeof webhookEvent?.object_id === "string" ? webhookEvent.object_id : undefined,
        requestBody: { headers: echo.headers, body },
        responseBody: { received: true },
    });

    const event = webhookEvent;
    if (
        event?.type === "qap.advice_session.completed" &&
        typeof event.object_id === "string" &&
        typeof event.object_owner_id === "string"
    ) {
        // Don't make the webhook sender wait — let the download run in the background.
        handleSessionCompleted(event.object_id, event.object_owner_id).catch((e) => {
            const detail = e instanceof DeepAlphaApiError
                ? { status: e.status, message: e.message, body: e.body }
                : { message: e instanceof Error ? e.message : String(e) };
            console.error("[listener] session.completed handler failed:", detail);
        });
    }

    return Response.json(echo);
}

// ── Bun server ───────────────────────────────────────────────────────────────

Bun.serve({
    port: PORT,
    async fetch(req: Request) {
        const url = new URL(req.url);

        // Demo home — two-pane dashboard (picker left, comm log right)
        if (url.pathname === "/") {
            return new Response(dashboardPage(), {
                headers: { "Content-Type": "text/html; charset=utf-8" },
            });
        }

        // Standalone picker — hosted in the dashboard's left pane
        if (url.pathname === "/picker") {
            return new Response(pickerPage(USERS), {
                headers: { "Content-Type": "text/html; charset=utf-8" },
            });
        }

        // Demo routes
        if (url.pathname === "/pick") {
            const idx = parseInt(url.searchParams.get("user") ?? "", 10);
            if (!Number.isFinite(idx)) {
                return new Response("Missing ?user=<idx>", { status: 400 });
            }
            return handlePick(idx);
        }

        if (url.pathname === "/session" && req.method === "POST") {
            const body = (await req.json().catch(() => ({}))) as SessionRequestBody;
            return handleCreateSession(body);
        }

        if (url.pathname === "/listener" && req.method === "POST") {
            return handleListener(req);
        }

        // Communication log page
        if (url.pathname === "/log") {
            return new Response(logPage(listComm(), completedSessionIds()), {
                headers: { "Content-Type": "text/html; charset=utf-8" },
            });
        }

        // Live SSE feed of comm_log rows
        if (url.pathname === "/events") {
            let unsubscribe = () => {};
            const stream = new ReadableStream({
                start(controller) {
                    const enc = new TextEncoder();
                    unsubscribe = subscribe((row) => {
                        try {
                            const html = commRowHtml(row, completedSessionIds());
                            const payload = `data: ${JSON.stringify(html)}\n\n`;
                            try {
                                controller.enqueue(enc.encode(payload));
                            } catch { /* client disconnected — cancel() will clean up */ }
                        } catch (e) {
                            console.error("[events] failed to render comm row:", e);
                        }
                    });
                },
                cancel() { unsubscribe(); },
            });
            return new Response(stream, {
                headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                },
            });
        }

        // Report PDF download
        if (url.pathname === "/report") {
            const sessionId = url.searchParams.get("session");
            if (!sessionId) {
                return new Response("Missing ?session=<id>", { status: 400 });
            }
            return handleReport(sessionId);
        }

        // Mock SSO debug callback
        if (url.pathname === "/debug") {
            const code = url.searchParams.get("code");
            if (!code) {
                return new Response("Debug callback hit without ?code", {
                    status: 400,
                    headers: { "Content-Type": "text/plain; charset=utf-8" },
                });
            }
            const tokenRes = await fetch(`http://localhost:${OAUTH_PORT}/token`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    grant_type: "authorization_code",
                    code,
                    redirect_uri: `${url.origin}/debug`,
                    client_id: "mock-debug",
                }).toString(),
            });
            const tokens: any = await tokenRes.json();
            let decoded: any = null;
            try {
                if (tokens.id_token) {
                    decoded = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString());
                }
            } catch { /* leave decoded null */ }
            return new Response(debugPage(tokens, decoded), {
                headers: { "Content-Type": "text/html; charset=utf-8" },
            });
        }

        // Mock SSO login
        if (url.pathname === "/login") {
            logComm({
                kind: "oauth",
                label: `${req.method} /login`,
                requestBody: Object.fromEntries(url.searchParams),
            });
            const params = new URLSearchParams(url.search);
            if (!params.has("redirect_uri")) {
                params.set("redirect_uri", `${url.origin}/debug`);
                if (!params.has("response_type")) params.set("response_type", "code");
                if (!params.has("client_id")) params.set("client_id", "mock-debug");
            }
            const qs = params.toString();
            return new Response(
                pickerPage(USERS, {
                    pageTitle: "Mock SSO Login",
                    emoji: "🔐",
                    title: "Sign in",
                    subtitle: "Mock SSO — choose an account",
                    note: "🛠 Development only — not a real identity provider",
                    hrefForUser: (i) => `/authorize?${qs}&user=${i}`,
                }),
                { headers: { "Content-Type": "text/html; charset=utf-8" } },
            );
        }

        if (url.pathname === "/authorize" && !url.searchParams.has("user")) {
            if (lastPickedUserIdx !== undefined && USERS[lastPickedUserIdx]) {
                console.log(`[authorize] auto-completing as user[${lastPickedUserIdx}] ${USERS[lastPickedUserIdx]!.name}`);
                const params = new URLSearchParams(url.search);
                params.set("user", String(lastPickedUserIdx));
                return Response.redirect(`${url.origin}/authorize?${params.toString()}`, 302);
            }
            return Response.redirect(`${url.origin}/login${url.search}`, 302);
        }

        if (url.pathname === "/authorize" && !url.searchParams.has("redirect_uri")) {
            return new Response(
                "Missing required OAuth parameter: redirect_uri after user selection.",
                { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
            );
        }

        // Proxy everything else to oauth2-mock-server
        const target = new URL(req.url);
        target.hostname = "localhost";
        target.port = String(OAUTH_PORT);

        const proxiedRes = await fetch(target.toString(), {
            method: req.method,
            headers: req.headers,
            body: req.body,
            redirect: "manual",
        });

        let oauthResponseBody: unknown = null;
        try {
            oauthResponseBody = await proxiedRes.clone().text();
        } catch { /* leave null */ }
        logComm({
            kind: "oauth",
            label: `${req.method} ${url.pathname}`,
            status: proxiedRes.status,
            requestBody: Object.fromEntries(url.searchParams),
            responseBody: oauthResponseBody,
        });

        return proxiedRes;
    },
});

// ── Ready ─────────────────────────────────────────────────────────────────────

console.log(`\nMerged server listening on http://localhost:${PORT}`);
console.log(`Issuer URL:  ${PUBLIC_ISSUER_URL}`);
console.log(`Discovery:   ${PUBLIC_ISSUER_URL}/.well-known/openid-configuration`);
console.log(`Tenant:      https://api.test.deepalpha.dev`);
console.log(`Client ID:   ${CLIENT_ID}`);
console.log("Routes:      GET / | GET /pick?user=N | POST /session | POST /listener");
console.log("             GET /log | GET /events | GET /report?session=ID");
console.log("             GET /login | GET /authorize | GET /debug | * → mock OAuth");
console.log("\nUsers:");
USERS.forEach((u, i) => console.log(`  [${i}] ${u.name} <${u.email}> roles=${u.roles.join(",")}`));
console.log("\nPress Ctrl+C to stop\n");

process.on("SIGINT", async () => { await server.stop(); process.exit(0); });
