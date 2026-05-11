import { DeepAlphaClient, DeepAlphaApiError } from "./public_api/client.ts";

const PORT = 9092;
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
        sub: "quantfolio.fbae4e5d-9606-438a-814d-c49ecf0fd4b0",
        email: "bjornar@quantfol.io",
        name: "Bjørnar Mundal",
        preferred_username: "Bjornar",
        roles: ["admin"],
    },
    {
        sub: "quantfolio.a1b2c3d4-1234-5678-abcd-ef0123456789",
        email: "alice@quantfol.io",
        name: "Alice Andersen",
        preferred_username: "Alice",
        roles: ["advisor"],
    },
    {
        sub: "quantfolio.deadbeef-cafe-babe-feed-c0ffee123456",
        email: "bob@quantfol.io",
        name: "Bob Bergström",
        preferred_username: "Bob",
        roles: ["advisor"],
    },
];

interface ImaginaryClient {
    name: string;
    email: string;
    country: string;
}

const IMAGINARY_CLIENTS: ImaginaryClient[] = [
    { name: "Erik Larsen", email: "erik.larsen@example.com", country: "NO" },
    { name: "Maria Svensson", email: "maria.svensson@example.com", country: "SE" },
    { name: "Hans Müller", email: "hans.mueller@example.com", country: "DE" },
    { name: "Sofia Lindqvist", email: "sofia.lindqvist@example.com", country: "SE" },
    { name: "Jan de Vries", email: "jan.devries@example.com", country: "NL" },
];

const AVATAR_COLORS = ["#6366f1", "#10b981", "#f59e0b"];
const BADGE_STYLES: Record<string, string> = {
    admin: "background:#fef3c7;color:#92400e",
    advisor: "background:#dbeafe;color:#1e40af",
    viewer: "background:#f3f4f6;color:#374151",
};

const escapeHtml = (s: string) =>
    s.replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
    );

const pickerPage = () => /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Select user — DeepAlpha lookup</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
       background:#f0f2f5;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .card{background:#fff;border-radius:14px;padding:36px 32px;width:420px;
        box-shadow:0 4px 32px rgba(0,0,0,.1)}
  .logo{text-align:center;font-size:36px;margin-bottom:8px}
  h1{text-align:center;font-size:22px;color:#111;margin-bottom:4px}
  .sub{text-align:center;font-size:14px;color:#999;margin-bottom:28px}
  a.user{display:flex;align-items:center;gap:14px;padding:14px;border:1.5px solid #e5e7eb;
         border-radius:10px;margin-bottom:10px;text-decoration:none;color:inherit;
         transition:border-color .15s,background .15s}
  a.user:hover{border-color:#6366f1;background:#fafafe}
  .av{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;
      justify-content:center;font-weight:700;font-size:19px;color:#fff;flex-shrink:0}
  .info{flex:1}
  .name{font-weight:600;font-size:15px;color:#111}
  .email{font-size:12px;color:#999;margin-top:2px}
  .badge{font-size:11px;font-weight:500;padding:3px 10px;border-radius:20px}
  .note{text-align:center;font-size:11px;color:#ccc;margin-top:22px}
</style>
</head>
<body>
<div class="card">
  <div class="logo">🔎</div>
  <h1>Pick a user</h1>
  <p class="sub">We'll look the email up via /v1/advisor and create an investor if missing.</p>
  ${USERS.map(
      (u, i) => `
  <a class="user" href="/pick?user=${i}">
    <div class="av" style="background:${AVATAR_COLORS[i]}">${escapeHtml(u.preferred_username[0]!)}</div>
    <div class="info">
      <div class="name">${escapeHtml(u.name)}</div>
      <div class="email">${escapeHtml(u.email)}</div>
    </div>
    <span class="badge" style="${BADGE_STYLES[u.roles[0]!] ?? ""}">${escapeHtml(u.roles[0]!)}</span>
  </a>`,
  ).join("")}
  <p class="note">Server-to-server auth via /v1/auth/token (client_credentials)</p>
</div>
</body>
</html>`;

interface ResultBlocks {
    user: { sub: string; email: string; name: string };
    advisorLookup: unknown;
    advisorId?: string;
    clients?: ImaginaryClient[];
    investorCreated?: unknown;
    error?: { status?: number; message: string; body?: unknown };
}

const resultPage = (r: ResultBlocks) => /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Result — DeepAlpha lookup</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
       background:#f0f2f5;min-height:100vh;padding:32px;color:#111}
  .card{background:#fff;border-radius:14px;padding:32px;max-width:880px;margin:0 auto;
        box-shadow:0 4px 32px rgba(0,0,0,.1)}
  h1{font-size:22px;margin-bottom:6px}
  .sub{font-size:13px;color:#999;margin-bottom:20px}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;
     margin:18px 0 8px}
  pre{background:#0f172a;color:#e2e8f0;border-radius:8px;padding:14px;
      font-size:12px;line-height:1.55;overflow:auto;word-break:break-all;white-space:pre-wrap}
  .err pre{background:#7f1d1d;color:#fee2e2}
  a.back{display:inline-block;margin-top:18px;font-size:13px;color:#6366f1;text-decoration:none}
  a.back:hover{text-decoration:underline}
  .pill{display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
        font-size:12px;background:#eef2ff;color:#4338ca;padding:3px 8px;border-radius:6px}
  table.clients{width:100%;border-collapse:collapse;margin-top:6px}
  table.clients th,table.clients td{text-align:left;padding:10px 12px;
        border-bottom:1px solid #e5e7eb;font-size:14px}
  table.clients th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;font-weight:600}
  table.clients tr:last-child td{border-bottom:none}
  button.session{background:#6366f1;color:#fff;border:none;border-radius:6px;
        padding:7px 12px;font-size:13px;font-weight:500;cursor:pointer}
  button.session:hover{background:#4f46e5}
</style>
</head>
<body>
<div class="card">
  <h1>${r.error ? "⚠️ Error" : "✅ Lookup complete"}</h1>
  <p class="sub">DeepAlpha test tenant · ${escapeHtml(new Date().toISOString())}</p>

  <h2>Picked user</h2>
  <pre>${escapeHtml(JSON.stringify(r.user, null, 2))}</pre>

  ${r.error ? `
    <div class="err">
      <h2>Error</h2>
      <pre>${escapeHtml(JSON.stringify(r.error, null, 2))}</pre>
    </div>` : ""}

  <h2>Advisor lookup (GET /v1/advisor?email=…)</h2>
  <pre>${escapeHtml(JSON.stringify(r.advisorLookup, null, 2))}</pre>

  ${r.advisorId ? `
    <h2>Saved advisor_id</h2>
    <p><span class="pill">${escapeHtml(r.advisorId)}</span></p>` : ""}

  ${r.clients ? `
    <h2>Clients</h2>
    <table class="clients" data-advisor-id="${escapeHtml(r.advisorId ?? "")}">
      <thead><tr><th>Name</th><th>Email</th><th>Country</th><th></th></tr></thead>
      <tbody>
        ${r.clients.map((c) => `
          <tr data-name="${escapeHtml(c.name)}" data-email="${escapeHtml(c.email)}" data-country="${escapeHtml(c.country)}">
            <td>${escapeHtml(c.name)}</td>
            <td>${escapeHtml(c.email)}</td>
            <td>${escapeHtml(c.country)}</td>
            <td><button class="session" type="button">Create session</button></td>
          </tr>`).join("")}
      </tbody>
    </table>
    <script>
      document.querySelector("table.clients")?.addEventListener("click", async (ev) => {
        const btn = ev.target instanceof Element ? ev.target.closest("button.session") : null;
        if (!btn) return;
        const tr = btn.closest("tr");
        const table = btn.closest("table");
        const name = tr?.dataset.name ?? "";
        const email = tr?.dataset.email ?? "";
        const country = tr?.dataset.country ?? "";
        const advisorId = table?.dataset.advisorId ?? "";

        // Open the tab SYNCHRONOUSLY on click so the browser allows it,
        // then redirect it once the API response arrives.
        const popup = window.open("about:blank", "_blank");
        if (!popup) {
          alert("Popup was blocked. Please allow popups for this page and try again.");
          return;
        }
        popup.document.write("<title>Creating session…</title><p style='font-family:sans-serif;padding:24px'>Creating session for " + name + "…</p>");

        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Working…";
        try {
          const res = await fetch("/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ advisorId, name, email, country }),
          });
          const data = await res.json();
          if (data.status === "ok" && data.sessionUrl) {
            popup.location.href = data.sessionUrl;
          } else {
            popup.close();
            alert("Error: " + (data.message || JSON.stringify(data)));
          }
        } catch (e) {
          popup.close();
          alert("Request failed: " + e);
        } finally {
          btn.disabled = false;
          btn.textContent = original;
        }
      });
    </script>` : ""}

  ${r.investorCreated !== undefined ? `
    <h2>Investor created (POST /v1/investor)</h2>
    <pre>${escapeHtml(JSON.stringify(r.investorCreated, null, 2))}</pre>` : ""}

  <a class="back" href="/">← back to picker</a>
</div>
</body>
</html>`;

async function handlePick(idx: number): Promise<Response> {
    const user = USERS[idx];
    if (!user) {
        return new Response("Unknown user index", { status: 400 });
    }

    const saved = { sub: user.sub, email: user.email, name: user.name };
    console.log("[pick] saved:", saved);

    const blocks: ResultBlocks = { user: saved, advisorLookup: null };

    try {
        const advisorRes = (await client.listAdvisors({ email: user.email })) as {
            advisors?: Array<{ advisor_id?: string }>;
        };
        blocks.advisorLookup = advisorRes;
        const matched = advisorRes?.advisors?.[0];
        console.log(`[pick] /v1/advisor returned ${advisorRes?.advisors?.length ?? 0} match(es)`);

        if (matched?.advisor_id) {
            blocks.advisorId = matched.advisor_id;
            blocks.clients = IMAGINARY_CLIENTS;
            console.log(`[pick] saved advisor_id=${matched.advisor_id}`);
        } else {
            console.log("[pick] no advisor → creating investor");
            const created = await client.createInvestor({
                name: user.name,
                email: user.email,
                country: "NO",
                investorType: "person",
            });
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
        const investorsRes = (await client.listInvestors({ advisorId, pageSize: 100 })) as {
            investors?: Array<{ id?: string; email?: string; name?: string }>;
        };
        const targetEmail = email.toLowerCase();
        let investorId = investorsRes?.investors?.find(
            (i) => (i.email ?? "").toLowerCase() === targetEmail,
        )?.id;
        let createdInvestor: unknown;

        if (!investorId) {
            console.log(`[session] no investor with email=${email} under this advisor → creating`);
            const newInvestor = (await client.createInvestor({
                name,
                email,
                country: country || "NO",
                investorType: "person",
                advisorId,
            })) as { id?: string };
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
        const created = (await client.createStateSession({
            advisor_id: advisorId,
            investor_id: investorId,
            name: `Session for ${name} @ ${new Date().toISOString()}`,
            advice_type: "MiFIID II investment Advice",
        } as never)) as { session_id?: string; links?: unknown };

        const rawLink = pickFirstUrl(created.links);
        const sessionUrl = rawLink
            ? rewriteHost(rawLink)
            : `https://${SESSION_HOST}/?session_id=${created.session_id ?? ""}`;
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

Bun.serve({
    port: PORT,
    async fetch(req: Request) {
        const url = new URL(req.url);

        if (url.pathname === "/" || url.pathname === "/login") {
            return new Response(pickerPage(), {
                headers: { "Content-Type": "text/html; charset=utf-8" },
            });
        }

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

        return new Response("Not found", { status: 404 });
    },
});

console.log(`\nSelect-and-lookup demo on http://localhost:${PORT}`);
console.log("Tenant:    https://api.test.deepalpha.dev");
console.log(`Client ID: ${CLIENT_ID}`);
console.log("\nUsers:");
USERS.forEach((u, i) => console.log(`  [${i}] ${u.name} <${u.email}>`));
console.log("\nPress Ctrl+C to stop\n");
