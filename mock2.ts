import { OAuth2Server } from "oauth2-mock-server";

const OAUTH_PORT = 9091;
const PORT = 9090;
const PUBLIC_ISSUER_URL = Bun.env.PUBLIC_ISSUER_URL ?? `http://localhost:${PORT}`;

const USERS = [
    {
        sub: "quantfolio.fbae4e5d-9606-438a-814d-c49ecf0fd4b0",
        email: "bjornar@quantfol.io",
        email_verified: true,
        name: "Bjørnar Mundal",
        preferred_username: "Bjornar",
        roles: ["admin"],
    },
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
];

const getUserByIndex = (idx: number) => USERS[idx] ?? USERS[0];
const getUserBySub = (sub: string) => USERS.find(u => u.sub === sub) ?? USERS[0];

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

    // Decode sub from the Bearer token payload (no verification needed for mock)
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

// ── Login page ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ["#6366f1", "#10b981", "#f59e0b"];
const BADGE_STYLES: Record<string, string> = {
    admin: "background:#fef3c7;color:#92400e",
    editor: "background:#dbeafe;color:#1e40af",
    viewer: "background:#f3f4f6;color:#374151",
};

const loginPage = (qs: string) => /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Mock SSO Login</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
       background:#f0f2f5;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .card{background:#fff;border-radius:14px;padding:36px 32px;width:400px;
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
  <div class="logo">🔐</div>
  <h1>Sign in</h1>
  <p class="sub">Mock SSO — choose an account</p>
  ${USERS.map((u, i) => `
  <a class="user" href="/authorize?${qs}&user=${i}">
    <div class="av" style="background:${AVATAR_COLORS[i]}">${u.preferred_username[0]}</div>
    <div class="info">
      <div class="name">${u.name}</div>
      <div class="email">${u.email}</div>
    </div>
    <span class="badge" style="${BADGE_STYLES[u.roles[0]] ?? ""}">${u.roles[0]}</span>
  </a>`).join("")}
  <p class="note">🛠 Development only — not a real identity provider</p>
</div>
</body>
</html>`;

// ── Debug landing page (used when no real OIDC client redirect_uri is supplied) ──

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

// ── Bun proxy ─────────────────────────────────────────────────────────────────

Bun.serve({
    port: PORT,
    async fetch(req: Request) {
        const url = new URL(req.url);

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

        if (url.pathname === "/" || url.pathname === "/login") {
            const params = new URLSearchParams(url.search);
            if (!params.has("redirect_uri")) {
                params.set("redirect_uri", `${url.origin}/debug`);
                if (!params.has("response_type")) params.set("response_type", "code");
                if (!params.has("client_id")) params.set("client_id", "mock-debug");
            }
            return new Response(loginPage(params.toString()), {
                headers: { "Content-Type": "text/html; charset=utf-8" },
            });
        }

        if (url.pathname === "/authorize" && !url.searchParams.has("user")) {
            return Response.redirect(`${url.origin}/login${url.search}`, 302);
        }

        if (url.pathname === "/authorize" && !url.searchParams.has("redirect_uri")) {
            return new Response(
                "Missing required OAuth parameter: redirect_uri after user selection.",
                { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
            );
        }

        const target = new URL(req.url);
        target.hostname = "localhost";
        target.port = String(OAUTH_PORT);

        return fetch(target.toString(), {
            method: req.method,
            headers: req.headers,
            body: req.body,
            redirect: "manual",
        });
    },
});

// ── Ready ─────────────────────────────────────────────────────────────────────

console.log(`\nMock SSO listening on http://localhost:${PORT}`);
console.log(`Issuer URL:  ${PUBLIC_ISSUER_URL}`);
console.log(`Discovery:   ${PUBLIC_ISSUER_URL}/.well-known/openid-configuration`);
console.log("\nUsers:");
USERS.forEach((u, i) => console.log(`  [${i}] ${u.name} <${u.email}> roles=${u.roles.join(",")}`));
console.log("\nPress Ctrl+C to stop\n");

process.on("SIGINT", async () => { await server.stop(); process.exit(0); });