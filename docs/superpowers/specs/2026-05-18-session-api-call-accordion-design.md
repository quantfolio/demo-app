# Session API call accordion on the result page

**Status:** Draft
**Date:** 2026-05-18

## Goal

In the per-investor sessions sub-table on `/pick?user=N`, make every session row a `<details>` accordion. Expanding a session reveals the chronological list of API calls captured for that session in SQLite. Each call is itself a `<details>` whose summary is `endpoint + ISO timestamp`; expanding it reveals the captured request and response JSON side-by-side as `<pre>` blocks.

Why: today the sub-table shows only status + a truncated `session_id`. The actual data — every QAP API call made while assembling the post-completion bundle — is in `session_api_calls` but invisible from the UI. This change surfaces it.

## Background

After [2026-05-18-per-investor-sessions-table-design.md](2026-05-18-per-investor-sessions-table-design.md), the result page renders, for each imaginary client, a sub-table of sessions. Each session row is currently:

```html
<tr title="{full_session_id}">
  <td>
    <span class="pill done">completed</span>
    <span class="sid">sess-abc…</span>
  </td>
</tr>
```

`session_api_calls` rows (written by `fetchSessionBundle` and `handleSessionCompleted`) carry `id`, `session_id`, `api_endpoint`, `request_body`, `response_body`, `timestamp`. They are oldest-first by `id`. A completed session typically has 6+ rows (one per API call in the bundle + report + PDF metadata).

## Non-goals

- No lazy loading. Everything is server-rendered with the initial `/pick` HTML. No new endpoints, no client-side fetch.
- No custom JS accordion mechanism. Expand/collapse is handled by native `<details>/<summary>`.
- No copy-to-clipboard, search, filter, or edit affordances within calls.
- No syntax highlighting for JSON — the existing dark-on-light `<pre>` styling is sufficient.
- No per-call height cap. Long responses expand the page; the user scrolls vertically.
- No persistence of which `<details>` were open across page refreshes (the browser may, but we don't add code for it).

## Design

### Data flow

```
GET /pick?user=N
  → handlePick(N)
    → listAdvisors                                       [unchanged]
    → if advisor_id found:
        for each c in IMAGINARY_CLIENTS:
          sessions = listSessionsForInvestorEmail(...)   [now also carries calls]
        blocks.clients = IMAGINARY_CLIENTS.map(...)
    → resultPage(blocks)                                 [renders nested <details>]
```

`listSessionsForInvestorEmail` is extended to attach the API calls to each returned session. Internally it now executes two prepared statements: the existing sessions query, plus one call-per-session lookup run in a loop.

### Type changes — `db.ts`

A new exported type and an extension of the existing `InvestorSessionRow`:

```ts
export interface ApiCallRow {
  id: number;
  api_endpoint: string;
  request_body: string | null;   // raw JSON text from SQLite, or NULL
  response_body: string;         // raw JSON text from SQLite (NOT NULL per schema)
  timestamp: string;             // ISO-8601
}

export interface InvestorSessionRow {
  session_id: string;
  completed: boolean;
  calls: ApiCallRow[];
}
```

Note the bodies are kept as **raw JSON-encoded strings** at this layer. The template re-parses + re-stringifies with `2` indents for display. Keeping them as strings here means SQLite results flow through without an intermediate `JSON.parse(JSON.stringify(...))` round-trip per row.

### SQL — `db.ts`

A second prepared statement:

```sql
SELECT id, api_endpoint, request_body, response_body, timestamp
FROM session_api_calls
WHERE session_id = ?
ORDER BY id ASC
```

`ORDER BY id ASC` so calls appear in the order they actually happened.

### `listSessionsForInvestorEmail` becomes

```ts
export function listSessionsForInvestorEmail(
  advisorId: string,
  email: string,
): InvestorSessionRow[] {
  try {
    const sessions = selectSessionsForInvestorEmail.all(
      advisorId, advisorId, email, advisorId, email,
    ) as Array<{ session_id: string; completed: number }>;

    return sessions.map((s) => ({
      session_id: s.session_id,
      completed: s.completed === 1,
      calls: selectApiCallsForSession.all(s.session_id) as ApiCallRow[],
    }));
  } catch (e) {
    console.error("[db] listSessionsForInvestorEmail failed:", e);
    return [];
  }
}
```

Errors anywhere in the chain are caught and an empty array returned — `/pick` must not break if a SQLite read fails.

### Type changes — `templates.ts`

Mirror `ApiCallRow` locally (same rationale as `InvestorSessionRow`: templates.ts has no runtime dependency on db.ts). Extend `InvestorSessionRow` to include `calls`.

### Markup — `templates.ts`

Inside the existing `<tr class="sessions-row">` for each client, the row body — currently emitted as the empty-state row or one `<tr>` per session — is replaced. Each non-empty session becomes:

```html
<tr title="{full session_id}">
  <td>
    <details class="session-acc">
      <summary>
        <span class="pill {done|wip}">{completed|in progress}</span>
        <span class="sid">{first 8 chars}…</span>
      </summary>
      <div class="calls">
        <!-- if calls.length === 0: -->
        <div class="empty">No API calls captured yet</div>

        <!-- else, one <details> per call: -->
        <details class="call-acc">
          <summary>
            <code class="endpoint">{api_endpoint}</code>
            <span class="ts">{timestamp}</span>
          </summary>
          <div class="bodies">
            <div class="body">
              <div class="label">Request</div>
              <pre>{pretty-printed request_body, or "—" if null}</pre>
            </div>
            <div class="body">
              <div class="label">Response</div>
              <pre>{pretty-printed response_body}</pre>
            </div>
          </div>
        </details>
        <!-- … -->
      </div>
    </details>
  </td>
</tr>
```

The outer `<tr class="empty">No sessions yet</tr>` (when `calls.length === 0` AND `sessions.length === 0` — i.e., the investor has never had a session) is unchanged from the previous spec. The new "No API calls captured yet" message is for the inner case: a session exists (status pill renders) but its `session_api_calls` rows are zero (in-progress session, webhook hasn't fired).

### Pretty-printing

In the template, each body string is parsed and re-stringified:

```ts
const pretty = (raw: string | null): string => {
  if (raw === null) return "—";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;  // already not valid JSON — render as-is
  }
};
```

Then `escapeHtml(pretty(body))` goes inside the `<pre>`.

### CSS additions — `templates.ts`

Append inside the existing `<style>` block:

```css
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
```

Notes:
- The default `<summary>` triangle is replaced with a custom `▸ / ▾`-style arrow via `::before` rotation so the layout is consistent across browsers (Chromium hides the marker via `::-webkit-details-marker`; Firefox respects `list-style:none`).
- `.bodies` is a 2-column CSS grid so request and response sit side-by-side. Inside the 880px card with the existing left padding (36px on `.sessions-row > td`), each column ends up around 380px — adequate for compact JSON, and the existing `<pre>` rules (`overflow:auto;word-break:break-all;white-space:pre-wrap`) handle the wider keys.

### `select_and_lookup.ts`

No change. `handlePick` continues to call `listSessionsForInvestorEmail`. The added `calls` field flows through transparently.

## Edge cases

- **Session has zero calls (in progress).** Inner `<details>` shows "No API calls captured yet". Status pill still says "in progress".
- **A `request_body` is NULL** (e.g., a no-args client method). Template renders `—` in the Request `<pre>`.
- **A body isn't valid JSON.** `pretty()` falls back to the raw string. This shouldn't happen since the recorder always JSON-stringifies, but the guard avoids template crashes.
- **Very large response bodies** (e.g., a fully-populated `advice_information` payload). The page grows long; no height cap per spec. User scrolls.
- **SQLite read failure on the per-session call query.** Wrapped in the same try/catch as the outer sessions query — returns `[]` for the failing call without breaking the page.

## Testing

Manual, consistent with the project's no-test-suite convention:

1. With an empty DB, `/pick?user=N` shows "No sessions yet" sub-tables as before.
2. Trigger a session through `/session` for one client. Refresh `/pick?user=N`. That client's sub-table shows one expandable session row with `in progress` status. Expanding it reveals "No API calls captured yet".
3. Complete the session in QAP test so the webhook fires. Refresh. The session row now reads `completed`. Expanding it reveals 6+ call entries in chronological order: `getAdviceSession`, `getAdviceInformation`, `listAdviceGoals`, `getAdviceTransactions`, zero or more `getAdviceGoal(goalId)` entries, `getReport`, `downloadReportPdf`.
4. Expand one call. Two columns appear side-by-side: Request and Response, both pretty-printed.
5. Confirm the PDF call's response body shows `{"path": "session_<id>.pdf", "size_bytes": …}` (the metadata recorded in lieu of the binary).
6. Confirm timestamps in the call summaries match the order rows were inserted (oldest first).
7. Confirm the previously-working "Create session" button on each Clients row still functions — it lives on the outer `<tr>`, not inside any new `<details>`.

## Out of scope (future)

- Search/filter across calls.
- Copy-button on individual JSON blocks.
- A standalone session detail page (`/session/{id}` route).
- Live tail of in-progress sessions.
- Compact / extended view toggle.
