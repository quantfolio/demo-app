import type { CommLogRow } from "./db.ts";

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

export interface ApiCallRow {
    id: number;
    api_endpoint: string;
    request_body: string | null;
    response_body: string;
    timestamp: string;
}

export interface InvestorSessionRow {
    session_id: string;
    completed: boolean;
    sessionUrl: string | null;
    calls: ApiCallRow[];
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

const prettyJson = (raw: string | null): string => {
    if (raw === null) return "—";
    try {
        return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
        return raw;
    }
};

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
  a.pill{text-decoration:none}
  a.pill.wip:hover{background:#fde68a}
  .sid{margin-left:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#9ca3af}
  details.session-acc{margin:2px 0}
  details.session-acc > summary{cursor:pointer;list-style:none;padding:2px 0;outline:none}
  details.session-acc > summary::-webkit-details-marker{display:none}
  details.session-acc[open] > summary{margin-bottom:6px}
  .calls{margin-left:18px;padding-left:8px;border-left:2px solid #e5e7eb}
  .calls .empty{color:#9ca3af;font-style:italic;font-size:12px;padding:4px 0}
  details.call-acc{margin:4px 0;padding:4px 0;border-top:1px solid #f3f4f6}
  details.call-acc:first-child{border-top:none}
  details.call-acc > summary{cursor:pointer;list-style:none;display:flex;gap:10px;align-items:baseline;outline:none}
  details.call-acc > summary::-webkit-details-marker{display:none}
  details.call-acc > summary::before{content:"▸";color:#9ca3af;font-size:10px;display:inline-block;width:10px;transition:transform .12s}
  details.call-acc[open] > summary::before{transform:rotate(90deg)}
  code.endpoint{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#374151}
  .ts{font-size:11px;color:#9ca3af;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  .bodies{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:6px 0 4px 16px}
  .bodies .label{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;margin-bottom:4px}
  .bodies pre{margin:0;font-size:11px;line-height:1.5}
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
                            <details class="session-acc">
                              <summary>
                                ${s.completed
                                  ? `<span class="pill done">completed</span>`
                                  : s.sessionUrl
                                    ? `<a class="pill wip" href="${escapeHtml(s.sessionUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">in progress ↗</a>`
                                    : `<span class="pill wip">in progress</span>`}
                                <span class="sid">${escapeHtml(s.session_id.slice(0, 8))}…</span>
                              </summary>
                              <div class="calls">
                                ${s.calls.length === 0
                                  ? `<div class="empty">No API calls captured yet</div>`
                                  : s.calls.map((call) => `
                                      <details class="call-acc">
                                        <summary>
                                          <code class="endpoint">${escapeHtml(call.api_endpoint)}</code>
                                          <span class="ts">${escapeHtml(call.timestamp)}</span>
                                        </summary>
                                        <div class="bodies">
                                          <div class="body">
                                            <div class="label">Request</div>
                                            <pre>${escapeHtml(prettyJson(call.request_body))}</pre>
                                          </div>
                                          <div class="body">
                                            <div class="label">Response</div>
                                            <pre>${escapeHtml(prettyJson(call.response_body))}</pre>
                                          </div>
                                        </div>
                                      </details>`).join("")}
                              </div>
                            </details>
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

  <a class="back" href="/picker">← back to picker</a>
</div>
</body>
</html>`;

const KIND_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  webhook_in: { label: "WEBHOOK IN", bg: "#22dd66", fg: "#062b13" },
  api_out: { label: "API OUT", bg: "#4488ff", fg: "#ffffff" },
  oauth: { label: "OAUTH", bg: "#aa66ff", fg: "#ffffff" },
};

const metaValue = (meta: string | null, key: string): string | undefined => {
  if (!meta) return undefined;
  try {
    const v = (JSON.parse(meta) as Record<string, unknown>)[key];
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
};

// The label cell — a plain span, or a link for incomplete sessions / downloads.
const labelCell = (row: CommLogRow, completed: Set<string>): string => {
  const text = escapeHtml(row.label);
  if (
    row.label === "POST /v2/advice_session" &&
    row.session_id &&
    !completed.has(row.session_id)
  ) {
    const url = metaValue(row.meta, "sessionUrl");
    if (url) {
      return `<a class="evt-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${text} ↗</a>`;
    }
  }
  if (row.label.includes("/download") && row.session_id) {
    return `<a class="evt-link" href="/report?session=${encodeURIComponent(row.session_id)}" target="_blank" rel="noopener">${text} ↗ PDF</a>`;
  }
  return `<span class="evt-label">${text}</span>`;
};

export const commRowHtml = (row: CommLogRow, completed: Set<string>): string => {
  const badge = KIND_BADGE[row.kind] ?? { label: row.kind, bg: "#999", fg: "#fff" };
  const sid = row.session_id ? `<span class="sid">${escapeHtml(row.session_id.slice(0, 8))}…</span>` : "";
  const status = row.status ? `<span class="evt-status">${escapeHtml(row.status)}</span>` : "";
  return /* html */ `
  <details class="evt evt-${escapeHtml(row.kind)}" data-id="${row.id}">
    <summary>
      <span class="ts">${escapeHtml(row.timestamp)}</span>
      <span class="badge" style="background:${badge.bg};color:${badge.fg}">${escapeHtml(badge.label)}</span>
      ${labelCell(row, completed)}
      ${sid}
      ${status}
    </summary>
    <div class="bodies">
      <div class="body"><div class="label">Request</div><pre>${escapeHtml(prettyJson(row.request_body))}</pre></div>
      <div class="body"><div class="label">Response</div><pre>${escapeHtml(prettyJson(row.response_body))}</pre></div>
    </div>
  </details>`;
};

export const logPage = (rows: CommLogRow[], completed: Set<string>): string => /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Communication Log</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
       background:#0f172a;min-height:100vh;padding:24px;color:#e2e8f0}
  h1{font-size:20px;margin-bottom:4px}
  .sub{font-size:12px;color:#94a3b8;margin-bottom:18px}
  a.back{font-size:12px;color:#818cf8;text-decoration:none}
  a.back:hover{text-decoration:underline}
  #feed{max-width:960px;margin:14px auto 0}
  details.evt{background:#1e293b;border-radius:8px;margin:6px 0;border-left:4px solid #475569}
  details.evt-webhook_in{border-left-color:#22dd66}
  details.evt-api_out{border-left-color:#4488ff}
  details.evt-oauth{border-left-color:#aa66ff}
  details.evt > summary{cursor:pointer;list-style:none;display:flex;gap:10px;align-items:baseline;
       padding:9px 12px;outline:none;flex-wrap:wrap}
  details.evt > summary::-webkit-details-marker{display:none}
  .ts{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#64748b}
  .badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;letter-spacing:.03em}
  .evt-label,.evt-link{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
  .evt-label{color:#e2e8f0}
  .evt-link{color:#818cf8;text-decoration:none}
  .evt-link:hover{text-decoration:underline}
  .sid{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#64748b}
  .evt-status{font-size:11px;color:#94a3b8}
  .bodies{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 12px 12px}
  .bodies .label{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:4px 0}
  .bodies pre{background:#0f172a;color:#e2e8f0;border-radius:6px;padding:10px;font-size:11px;
       line-height:1.5;overflow:auto;white-space:pre-wrap;word-break:break-all;margin:0}
</style>
</head>
<body>
  <div style="max-width:960px;margin:0 auto">
    <h1>\u{1F4E1} Communication Log</h1>
    <p class="sub">Live feed of webhooks, API calls and OAuth traffic · <span id="status">connecting…</span></p>
    <a class="back" href="/picker">← back to picker</a>
  </div>
  <div id="feed">
    ${rows.map((r) => commRowHtml(r, completed)).join("")}
  </div>
<script>
  const feed = document.getElementById("feed");
  const statusEl = document.getElementById("status");
  const es = new EventSource("/events");
  es.onopen = () => { statusEl.textContent = "live"; };
  es.onerror = () => { statusEl.textContent = "disconnected — retrying…"; };
  es.onmessage = (e) => {
    try {
      const html = JSON.parse(e.data);
      feed.insertAdjacentHTML("afterbegin", html);
    } catch (err) {
      console.error("bad event", err);
    }
  };
</script>
</body>
</html>`;

// Two-pane dashboard: the picker/lookup flow on the left, the live
// communication log on the right, separated by a draggable divider.
// Each pane is an iframe hosting an existing standalone page unchanged.
export const dashboardPage = (): string => /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>DeepAlpha — Dashboard</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{display:flex;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:hidden}
  iframe{height:100%;border:none;display:block}
  #left{width:50%}
  #right{flex:1}
  #divider{width:6px;flex-shrink:0;cursor:col-resize;background:#cbd5e1}
  #divider:hover{background:#6366f1}
  /* While dragging, suppress iframe pointer events so mousemove keeps
     reaching this document instead of being swallowed by the iframe. */
  body.dragging{user-select:none;cursor:col-resize}
  body.dragging iframe{pointer-events:none}
</style>
</head>
<body>
  <iframe id="left" src="/picker" title="Pick & lookup"></iframe>
  <div id="divider" title="Drag to resize"></div>
  <iframe id="right" src="/log" title="Communication log"></iframe>
<script>
  const left = document.getElementById("left");
  const divider = document.getElementById("divider");
  divider.addEventListener("mousedown", (e) => {
    e.preventDefault();
    document.body.classList.add("dragging");
    const onMove = (ev) => {
      const w = Math.min(Math.max(ev.clientX, 200), window.innerWidth - 200);
      left.style.width = w + "px";
    };
    const onUp = () => {
      document.body.classList.remove("dragging");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
</script>
</body>
</html>`;
