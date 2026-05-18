# Session API call accordion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert each session row in the per-investor sub-table into a native `<details>` accordion. Expanding it reveals the chronological `session_api_calls` for that session; each call is itself a `<details>` that opens to show request + response JSON side-by-side. All data is server-rendered with `/pick`.

**Architecture:** Add a new SQL prepared statement and helper in `db.ts` that loads API calls for a given `session_id` and attaches them to each `InvestorSessionRow`. Extend the duplicated type in `templates.ts`. Replace the markup of each session sub-row inside `resultPage` with a two-level `<details>` structure, add a small block of CSS to constrain it. No JavaScript, no new routes, no schema changes. `select_and_lookup.ts` and `public_api/client.ts` are untouched.

**Tech Stack:** Bun, `bun:sqlite`, TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`). Native HTML `<details>/<summary>`. CSS grid for the side-by-side request/response layout.

**Spec:** [docs/superpowers/specs/2026-05-18-session-api-call-accordion-design.md](../specs/2026-05-18-session-api-call-accordion-design.md)

---

## Background reading for the implementer

Before starting:

1. Read the spec linked above end-to-end. The "Markup", "CSS additions", and "Pretty-printing" sections are the source of truth for the exact code.
2. Skim [db.ts](../../../db.ts) — the existing `selectSessionsForInvestorEmail` prepared statement and `listSessionsForInvestorEmail` function are the pattern to extend. Note that `request_body` is nullable TEXT (per schema); `response_body` is NOT NULL TEXT.
3. Skim [templates.ts](../../../templates.ts) — specifically the existing `<tr class="sessions-row">` block inside `resultPage` (the part that emits either `<tr class="empty"><td>No sessions yet</td></tr>` or one `<tr title="…">` per session). You'll replace that inner branch.
4. The existing `.pill.done` / `.pill.wip` / `.sid` styles from the previous feature stay as-is; the new accordion CSS sits alongside them.

Conventions:
- Strict TypeScript. Do not modify `public_api/client.ts` or `select_and_lookup.ts`.
- One commit per task; commit messages shown.
- `verbatimModuleSyntax` is on — types-only imports use `import type`.

---

## Task 1: Add `ApiCallRow`, prepared statement, and per-session calls lookup in `db.ts`

**Files:**
- Modify: `db.ts`

This task adds one exported type, one prepared statement, and extends the existing `listSessionsForInvestorEmail` to attach calls to each returned session. `InvestorSessionRow` gains a `calls: ApiCallRow[]` field.

- [ ] **Step 1: Add the new prepared statement**

In `db.ts`, just below the existing `const selectSessionsForInvestorEmail = db.prepare(...)` block, insert:

```ts
const selectApiCallsForSession = db.prepare(`
  SELECT id, api_endpoint, request_body, response_body, timestamp
  FROM session_api_calls
  WHERE session_id = ?
  ORDER BY id ASC
`);
```

`ORDER BY id ASC` so calls appear in the order they actually happened (oldest first).

- [ ] **Step 2: Add the `ApiCallRow` type and extend `InvestorSessionRow`**

Find the existing block:

```ts
export interface InvestorSessionRow {
  session_id: string;
  completed: boolean;
}
```

Replace with:

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

- [ ] **Step 3: Wire calls into `listSessionsForInvestorEmail`**

Replace the body of `listSessionsForInvestorEmail` with:

```ts
export function listSessionsForInvestorEmail(
  advisorId: string,
  email: string,
): InvestorSessionRow[] {
  try {
    const sessions = selectSessionsForInvestorEmail.all(
      advisorId,
      advisorId,
      email,
      advisorId,
      email,
    ) as Array<{
      session_id: string;
      completed: number;
    }>;
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

Notes:
- `selectApiCallsForSession.all(sessionId)` returns objects whose keys match the SELECT columns exactly — that's already the `ApiCallRow` shape (`id`, `api_endpoint`, `request_body`, `response_body`, `timestamp`), so the `as ApiCallRow[]` cast is safe.
- The single try/catch covers both queries. If the inner call query throws for any session, the whole result returns `[]` and the page renders empty sub-tables. Matches the existing safety policy.

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`
Expected: `templates.ts` will error because `InvestorSessionRow` now requires `calls` but its mirror type in `templates.ts` doesn't have it yet. That's fine — Task 2 fixes it. Don't commit yet.

If `tsc` reports an unrelated error in `db.ts` itself, fix before continuing.

- [ ] **Step 5: Smoke-test the helper in isolation**

```bash
rm -rf data/
bun -e "
import {
  recordOtherCall,
  recordSessionCall,
  listSessionsForInvestorEmail,
} from './db.ts';

// Path B: investor pre-existed; one completed session with 3 API calls.
recordOtherCall(
  { advisorId: 'adv-1' },
  'GET /v1/investor',
  { advisorId: 'adv-1', pageSize: 100 },
  { investors: [{ id: 'inv-1', email: 'erik@example.com', name: 'Erik' }] },
);
recordOtherCall(
  { advisorId: 'adv-1', investorId: 'inv-1' },
  'POST /v1/state_session',
  { advisor_id: 'adv-1', investor_id: 'inv-1' },
  { session_id: 'sess-A' },
);
recordSessionCall('sess-A', 'GET /v2/advice_session/{session_id}', { sessionId: 'sess-A' }, { id: 'sess-A', status: 'complete' });
recordSessionCall('sess-A', 'GET /v2/advice_session/{session_id}/advice_information', { sessionId: 'sess-A' }, { profile: { riskTolerance: 'R10' } });
recordSessionCall('sess-A', 'POST /v1/report/{investor_id}/{session_id}/download', { investorId: 'inv-1', sessionId: 'sess-A', files: [] }, { path: 'session_sess-A.pdf', size_bytes: 12345 });

const sessions = listSessionsForInvestorEmail('adv-1', 'erik@example.com');
console.log('sessions count:', sessions.length);
console.log('first session:', sessions[0]?.session_id, 'completed=', sessions[0]?.completed, 'calls=', sessions[0]?.calls.length);
console.log('call endpoints:', sessions[0]?.calls.map((c) => c.api_endpoint));
console.log('first call response_body type:', typeof sessions[0]?.calls[0]?.response_body);
"
```

Expected output:

```
sessions count: 1
first session: sess-A completed= true calls= 3
call endpoints: [
  "GET /v2/advice_session/{session_id}",
  "GET /v2/advice_session/{session_id}/advice_information",
  "POST /v1/report/{investor_id}/{session_id}/download",
]
first call response_body type: string
```

Critical checks:
- 3 calls in chronological order (matches the insertion order — `id ASC`).
- `response_body` is a string (raw JSON text), not an object.

- [ ] **Step 6: Clean up the smoke-test DB**

```bash
rm -rf data/
```

- [ ] **Step 7: Hold the commit**

Don't commit `db.ts` alone — Task 2 makes the templates side match, and the two should land together so `bunx tsc --noEmit` is clean at every commit. Proceed straight to Task 2.

---

## Task 2: Extend types and render the accordion in `templates.ts`

**Files:**
- Modify: `templates.ts`

Three changes here: mirror `ApiCallRow`/extend `InvestorSessionRow`, add the accordion CSS block, and replace the inner session-row markup with the two-level `<details>` structure.

- [ ] **Step 1: Extend the type block**

Find the existing block at the top of `templates.ts`:

```ts
export interface InvestorSessionRow {
    session_id: string;
    completed: boolean;
}

export type ClientWithSessions = ImaginaryClient & { sessions: InvestorSessionRow[] };
```

Replace with:

```ts
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
    calls: ApiCallRow[];
}

export type ClientWithSessions = ImaginaryClient & { sessions: InvestorSessionRow[] };
```

The `ApiCallRow` shape is identical to the one in `db.ts` (duplicated locally to keep `templates.ts` free of a runtime `db.ts` import).

- [ ] **Step 2: Add a `pretty` helper near `escapeHtml`**

Just below the existing `export const escapeHtml = ...;` line (around line 23–27 of `templates.ts`), insert:

```ts
const prettyJson = (raw: string | null): string => {
    if (raw === null) return "—";
    try {
        return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
        return raw;
    }
};
```

This stays module-local (no `export`) because nothing outside `templates.ts` needs it.

- [ ] **Step 3: Add the accordion CSS**

Find the existing `.sid{margin-left:8px;...}` line inside the `<style>` block (it was added in the previous feature). Just below it, before the closing `</style>` tag, insert:

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

- [ ] **Step 4: Replace the per-session markup**

Find the existing block inside `resultPage`'s template literal:

```ts
                  ${c.sessions.length === 0
                    ? `<tr class="empty"><td>No sessions yet</td></tr>`
                    : c.sessions.map((s) => `
                        <tr title="${escapeHtml(s.session_id)}">
                          <td>
                            <span class="pill ${s.completed ? "done" : "wip"}">${s.completed ? "completed" : "in progress"}</span>
                            <span class="sid">${escapeHtml(s.session_id.slice(0, 8))}…</span>
                          </td>
                        </tr>`).join("")}
```

Replace with:

```ts
                  ${c.sessions.length === 0
                    ? `<tr class="empty"><td>No sessions yet</td></tr>`
                    : c.sessions.map((s) => `
                        <tr title="${escapeHtml(s.session_id)}">
                          <td>
                            <details class="session-acc">
                              <summary>
                                <span class="pill ${s.completed ? "done" : "wip"}">${s.completed ? "completed" : "in progress"}</span>
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
```

Notes:
- Both layers of `<details>` are closed within the same `.map(...)` template literal so the resulting HTML is well-formed.
- `escapeHtml(prettyJson(...))` is critical — `prettyJson` returns text that may contain `<`, `>`, `&`, `"`; without escaping, response bodies that include HTML-like substrings would break the page or open XSS holes.
- The outer `<tr title="…">` keeps the full `session_id` as a tooltip on hover, same as before.

- [ ] **Step 5: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Smoke-test the rendered HTML offline**

```bash
bun -e "
import { resultPage } from './templates.ts';

const html = resultPage({
  user: { sub: 'u1', email: 'alice@example.com', name: 'Alice' },
  advisorLookup: { advisors: [{ advisor_id: 'adv-1' }] },
  advisorId: 'adv-1',
  clients: [
    {
      name: 'Erik Larsen', email: 'erik@example.com', country: 'NO',
      sessions: [
        {
          session_id: 'sess-completed-12345',
          completed: true,
          calls: [
            { id: 1, api_endpoint: 'GET /v2/advice_session/{session_id}', request_body: '{\"sessionId\":\"sess-completed-12345\"}', response_body: '{\"id\":\"sess-completed-12345\",\"status\":\"complete\"}', timestamp: '2026-05-18T11:29:43Z' },
            { id: 2, api_endpoint: 'POST /v1/report/{investor_id}/{session_id}/download', request_body: '{\"files\":[]}', response_body: '{\"path\":\"session_sess-completed-12345.pdf\",\"size_bytes\":819289}', timestamp: '2026-05-18T11:29:45Z' },
          ],
        },
        {
          session_id: 'sess-in-progress-67890',
          completed: false,
          calls: [],
        },
      ],
    },
    {
      name: 'Maria', email: 'maria@example.com', country: 'SE',
      sessions: [],
    },
  ],
});

const lines = html.split('\n');
for (const l of lines) {
  if (l.match(/session-acc|call-acc|bodies|class=\"pill (done|wip)\"|No (sessions|API calls) yet|class=\"endpoint\"|<pre>|class=\"ts\"/)) {
    console.log(l.trim());
  }
}
" | head -50```

Expected to contain (among others):

```
<details class="session-acc">
<span class="pill done">completed</span>
<details class="call-acc">
<code class="endpoint">GET /v2/advice_session/{session_id}</code>
<span class="ts">2026-05-18T11:29:43Z</span>
<div class="bodies">
<pre>{
<code class="endpoint">POST /v1/report/{investor_id}/{session_id}/download</code>
<span class="pill wip">in progress</span>
<div class="empty">No API calls captured yet</div>
<tr class="empty"><td>No sessions yet</td></tr>
```

(Order may differ slightly; the point is each pattern appears.)

- [ ] **Step 7: Commit Task 1 + Task 2 together**

Because Task 1's type change requires Task 2's template update to type-check, the two land in one commit:

```bash
git add db.ts templates.ts
git commit -m "$(cat <<'EOF'
feat: expand session rows into API call accordion on /pick

Each session row in the per-investor sub-table becomes a native <details>;
opening it lists the captured session_api_calls in chronological order, with
a second-level <details> per call for request/response JSON side-by-side.
db.ts gains ApiCallRow and a per-session call lookup; templates.ts adds the
nested markup and accordion CSS.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: End-to-end verification

**Files:**
- (Verification only — no edits)

- [ ] **Step 1: Boot with an existing DB**

If you already have `data/qap.sqlite` with completed sessions (from the earlier bug-fix verification), keep it. Otherwise:

```bash
rm -rf data/
bun run select_and_lookup.ts
```

Trigger a session via `/pick` + `/session` and a `qap.advice_session.completed` webhook so at least one session has `session_api_calls` rows.

- [ ] **Step 2: Browser check — completed session**

Open `http://localhost:9090/pick?user=0`. Inside the Clients table, locate the client whose sub-table has a `completed` pill. Click anywhere on that pill / row's summary area. The session row should expand to reveal a vertical list of call entries with a small `▸` chevron, each labelled with the endpoint and timestamp.

Click one call entry's chevron. Two columns appear side-by-side under it: `Request` (pretty-printed JSON) and `Response` (pretty-printed JSON). Confirm:
- Order is chronological (`getAdviceSession` first, `downloadReportPdf` last).
- The PDF call's response is `{"path": "session_<id>.pdf", "size_bytes": <N>}`.
- The chevron rotates to `▾` (CSS 90° rotation) when open.

- [ ] **Step 3: Browser check — in-progress session**

If you have a session that's been created but never completed (no webhook fired), expanding it should show the muted "No API calls captured yet" line, no call entries.

- [ ] **Step 4: Browser check — empty client**

A client with no sessions still shows "No sessions yet" as before. No regression.

- [ ] **Step 5: Browser check — existing "Create session" still works**

Click "Create session" on any client row. Confirm the popup opens to the session URL — the new `<details>` block lives in the per-client sub-row, not in the click-handler path.

- [ ] **Step 6: Sanity-check large payloads**

If any captured call has a large response body (e.g., `getAdviceInformation` can be tens of KB), the page should grow vertically and remain navigable. The spec deliberately has no `max-height` cap.

- [ ] **Step 7: No commit needed**

Verification only.

---

## Done criteria

- `bunx tsc --noEmit` clean.
- `db.ts` exports `ApiCallRow` and the extended `InvestorSessionRow { calls: ApiCallRow[] }`. `listSessionsForInvestorEmail` attaches calls per session.
- `templates.ts` defines a duplicated `ApiCallRow`, extends its local `InvestorSessionRow`, defines `prettyJson`, and emits two-level `<details>` per session.
- `/pick?user=N` shows clickable session accordions; expanding reveals API-call accordions; expanding a call reveals side-by-side request/response JSON.
- One commit on top of `116a9cc` (the spec commit) combining Task 1 + Task 2.
