export interface PickerUser {
    name: string;
    email: string;
    preferred_username: string;
    roles: string[];
}

export interface ImaginaryClient {
    name: string;
    email: string;
    country: string;
}

export interface InvestorSessionRow {
    session_id: string;
    completed: boolean;
}

export type ClientWithSessions = ImaginaryClient & { sessions: InvestorSessionRow[] };

export interface ResultBlocks {
    user: { sub: string; email: string; name: string };
    advisorLookup: unknown;
    advisorId?: string;
    clients?: ClientWithSessions[];
    investorCreated?: unknown;
    error?: { status?: number; message: string; body?: unknown };
}

export const escapeHtml = (s: string): string =>
    s.replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
    );

const AVATAR_COLORS = ["#6366f1", "#10b981", "#f59e0b"];
const BADGE_STYLES: Record<string, string> = {
    admin: "background:#fef3c7;color:#92400e",
    advisor: "background:#dbeafe;color:#1e40af",
    viewer: "background:#f3f4f6;color:#374151",
};

export interface PickerPageOpts {
    hrefForUser?: (i: number) => string;
    title?: string;
    subtitle?: string;
    emoji?: string;
    note?: string;
    pageTitle?: string;
}

export const pickerPage = (users: PickerUser[], opts: PickerPageOpts = {}): string => {
    const hrefForUser = opts.hrefForUser ?? ((i: number) => `/pick?user=${i}`);
    const emoji = opts.emoji ?? "🔎";
    const title = opts.title ?? "Pick a user";
    const subtitle = opts.subtitle ?? "We'll look the email up via /v1/advisor and create an investor if missing.";
    const note = opts.note ?? "Server-to-server auth via /v1/auth/token (client_credentials)";
    const pageTitle = opts.pageTitle ?? "Select user — DeepAlpha lookup";

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(pageTitle)}</title>
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
  <div class="logo">${emoji}</div>
  <h1>${escapeHtml(title)}</h1>
  <p class="sub">${escapeHtml(subtitle)}</p>
  ${users
      .map(
          (u, i) => `
  <a class="user" href="${escapeHtml(hrefForUser(i))}">
    <div class="av" style="background:${AVATAR_COLORS[i % AVATAR_COLORS.length]}">${escapeHtml(u.preferred_username[0]!)}</div>
    <div class="info">
      <div class="name">${escapeHtml(u.name)}</div>
      <div class="email">${escapeHtml(u.email)}</div>
    </div>
    <span class="badge" style="${BADGE_STYLES[u.roles[0]!] ?? ""}">${escapeHtml(u.roles[0]!)}</span>
  </a>`,
      )
      .join("")}
  <p class="note">${escapeHtml(note)}</p>
</div>
</body>
</html>`;
};

export const resultPage = (r: ResultBlocks): string => /* html */ `<!DOCTYPE html>
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
  tr.sessions-row > td{background:#f9fafb;padding:6px 12px 12px 36px;border-bottom:1px solid #e5e7eb}
  table.sessions{width:100%;border-collapse:collapse}
  table.sessions td{padding:4px 8px;font-size:13px;border:none}
  table.sessions tr.empty td{color:#9ca3af;font-style:italic}
  .pill.done{background:#d1fae5;color:#065f46}
  .pill.wip{background:#fef3c7;color:#92400e}
  .sid{margin-left:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#9ca3af}
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
          </tr>
          <tr class="sessions-row">
            <td colspan="4">
              <table class="sessions">
                <tbody>
                  ${c.sessions.length === 0
                    ? `<tr class="empty"><td>No sessions yet</td></tr>`
                    : c.sessions.map((s) => `
                        <tr title="${escapeHtml(s.session_id)}">
                          <td>
                            <span class="pill ${s.completed ? "done" : "wip"}">${s.completed ? "completed" : "in progress"}</span>
                            <span class="sid">${escapeHtml(s.session_id.slice(0, 8))}…</span>
                          </td>
                        </tr>`).join("")}
                </tbody>
              </table>
            </td>
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
