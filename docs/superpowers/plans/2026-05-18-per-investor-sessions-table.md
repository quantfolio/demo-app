# Per-investor sessions table — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the `/pick?user=N` result page, render a small sub-table beneath each imaginary client row in the existing Clients table, listing that client's prior sessions for the picked advisor. Each session row shows an inferred status (`completed` / `in progress`) and a muted short form of `session_id`. Empty state is a single "No sessions yet" row.

**Architecture:** A new synchronous read helper `listSessionsForInvestorEmail(advisorId, email)` in `db.ts` performs a single SQL query (joining `other_api_calls` to itself by investor_id, with an `EXISTS` against `session_api_calls` for completion). `handlePick` calls it once per imaginary client and decorates each client object with a `sessions` array. `templates.ts` extends `ResultBlocks.clients` to carry the new shape and renders one extra `<tr class="sessions-row">` beneath each client row, containing a nested status sub-table. No new routes, no client-side fetches, no schema changes.

**Tech Stack:** Bun, `bun:sqlite` (already in use), TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`). SQLite's built-in `json_extract` does the JSON lookups against the existing `request_body` / `response_body` TEXT columns.

**Spec:** [docs/superpowers/specs/2026-05-18-per-investor-sessions-table-design.md](../specs/2026-05-18-per-investor-sessions-table-design.md)

---

## Background reading for the implementer

Before starting:

1. Read the spec linked above end-to-end. The "SQL" and "`templates.ts` changes" sections are the source of truth for the exact query and the HTML/CSS shape.
2. Skim [db.ts](../../../db.ts) — you'll add one prepared statement and one exported function alongside the existing recorders. The pattern (top-level `db.prepare(...)`, sync API, try/catch in exported functions) is what to follow.
3. Skim [templates.ts](../../../templates.ts) — specifically the `ResultBlocks` type, the existing Clients table block inside `resultPage`, and the existing `.pill` CSS rule (lines 124–125). You'll extend the types and inject markup + CSS in that file.
4. Skim [select_and_lookup.ts](../../../select_and_lookup.ts) — the only change here is in `handlePick`, where you replace the single line that assigns `blocks.clients = IMAGINARY_CLIENTS` with a `.map(...)` that decorates each client with a `sessions` array.

Conventions:
- Strict TypeScript. `verbatimModuleSyntax` means type-only imports must use `import type`.
- `noUncheckedIndexedAccess` is on.
- One commit per task; commit messages shown.
- Do not modify `public_api/client.ts`.

---

## Task 1: Add `listSessionsForInvestorEmail` to `db.ts`

**Files:**
- Modify: `db.ts`

This task adds one exported type, one prepared statement, and one exported function. The prepared statement is created at module load like the existing `insertSession` / `insertOther`.

- [ ] **Step 1: Add the prepared statement and exported function**

Open `db.ts`. Just below the existing `const insertOther = db.prepare(...)` block and above the `stringifyOrNull` helper, insert:

```ts
const selectSessionsForInvestorEmail = db.prepare(`
  SELECT
    json_extract(s.response_body, '$.session_id') AS session_id,
    EXISTS (
      SELECT 1 FROM session_api_calls c
      WHERE c.session_id = json_extract(s.response_body, '$.session_id')
    ) AS completed
  FROM other_api_calls s
  WHERE s.api_endpoint = 'POST /v1/state_session'
    AND s.advisor_id = ?
    AND json_extract(s.response_body, '$.session_id') IS NOT NULL
    AND s.investor_id IN (
      SELECT json_extract(response_body, '$.id')
      FROM other_api_calls
      WHERE api_endpoint = 'POST /v1/investor'
        AND advisor_id = ?
        AND json_extract(request_body, '$.email') = ?
    )
  ORDER BY s.id DESC
`);

export interface InvestorSessionRow {
  session_id: string;
  completed: boolean;
}

export function listSessionsForInvestorEmail(
  advisorId: string,
  email: string,
): InvestorSessionRow[] {
  try {
    const rows = selectSessionsForInvestorEmail.all(advisorId, advisorId, email) as Array<{
      session_id: string;
      completed: number;
    }>;
    return rows.map((r) => ({
      session_id: r.session_id,
      completed: r.completed === 1,
    }));
  } catch (e) {
    console.error("[db] listSessionsForInvestorEmail failed:", e);
    return [];
  }
}
```

Notes:
- `selectSessionsForInvestorEmail.all(...)` returns an array of objects. `bun:sqlite` returns each `EXISTS(...)` column as a JS number (`0` or `1`), which is why we coerce to boolean in the map.
- The first two `?` placeholders both bind to `advisorId` (one for the outer query, one for the inner subquery). The third binds to `email`. This is intentional — see the spec's SQL section.
- On any SQLite error, return `[]` so a read failure can't break `/pick`. Matches the recorders' policy.

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Smoke-test in isolation**

Set up a fresh DB with synthetic data and confirm the helper returns the expected rows.

```bash
rm -rf data/
bun -e "
import { recordOtherCall, recordSessionCall, listSessionsForInvestorEmail } from './db.ts';

// Two state_session rows for the same advisor + investor (one completed, one not).
recordOtherCall(
  { advisorId: 'adv-1', investorId: 'inv-1' },
  'POST /v1/investor',
  { name: 'X', email: 'erik.larsen@example.com', country: 'NO', investorType: 'person', advisorId: 'adv-1' },
  { id: 'inv-1' },
);
recordOtherCall(
  { advisorId: 'adv-1', investorId: 'inv-1' },
  'POST /v1/state_session',
  { advisor_id: 'adv-1', investor_id: 'inv-1' },
  { session_id: 'sess-A' },
);
recordOtherCall(
  { advisorId: 'adv-1', investorId: 'inv-1' },
  'POST /v1/state_session',
  { advisor_id: 'adv-1', investor_id: 'inv-1' },
  { session_id: 'sess-B' },
);
// sess-A has a session_api_calls row → completed; sess-B does not.
recordSessionCall('sess-A', 'GET /v2/advice_session/{session_id}', { sessionId: 'sess-A' }, { ok: true });

console.log('match:', listSessionsForInvestorEmail('adv-1', 'erik.larsen@example.com'));
console.log('wrong email:', listSessionsForInvestorEmail('adv-1', 'nobody@example.com'));
console.log('wrong advisor:', listSessionsForInvestorEmail('adv-2', 'erik.larsen@example.com'));
"
```

Expected output (order matters — newest first):

```
match: [
  { session_id: "sess-B", completed: false },
  { session_id: "sess-A", completed: true },
]
wrong email: []
wrong advisor: []
```

If any of these don't match, fix before proceeding. Common causes:
- `bun:sqlite` returning `completed` as a different type → adjust the coercion.
- The `IN (SELECT json_extract(...))` returning no matches → confirm the inner query is finding the investor row (try running it directly with `sqlite3 data/qap.sqlite`).

- [ ] **Step 4: Clean up the smoke-test DB**

```bash
rm -rf data/
```

- [ ] **Step 5: Commit**

```bash
git add db.ts
git commit -m "$(cat <<'EOF'
feat: add listSessionsForInvestorEmail read helper to db module

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extend `ResultBlocks` types and render the sub-tables in `templates.ts`

**Files:**
- Modify: `templates.ts`

Type changes plus markup + CSS additions in `resultPage`. The `ImaginaryClient` type stays as-is; we introduce a new `ClientWithSessions` shape and switch `ResultBlocks.clients` to carry it.

- [ ] **Step 1: Update the type block at the top of `templates.ts`**

Replace the existing `ImaginaryClient` + `ResultBlocks` block (lines 8–21 of the current file):

```ts
export interface ImaginaryClient {
    name: string;
    email: string;
    country: string;
}

export interface ResultBlocks {
    user: { sub: string; email: string; name: string };
    advisorLookup: unknown;
    advisorId?: string;
    clients?: ImaginaryClient[];
    investorCreated?: unknown;
    error?: { status?: number; message: string; body?: unknown };
}
```

with:

```ts
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
```

Notes:
- `InvestorSessionRow` is duplicated here (also exists in `db.ts`) so `templates.ts` has no runtime import from `db.ts`. The fields are identical.
- `ClientWithSessions` is the shape `handlePick` will assign to `blocks.clients` in Task 3.

- [ ] **Step 2: Add the sub-table CSS rules**

Find the `<style>` block inside `resultPage` (starts around line 109). Just before the closing `</style>` tag (currently around line 134), insert:

```css
  tr.sessions-row > td{background:#f9fafb;padding:6px 12px 12px 36px;border-bottom:1px solid #e5e7eb}
  table.sessions{width:100%;border-collapse:collapse}
  table.sessions td{padding:4px 8px;font-size:13px;border:none}
  table.sessions tr.empty td{color:#9ca3af;font-style:italic}
  .pill.done{background:#d1fae5;color:#065f46}
  .pill.wip{background:#fef3c7;color:#92400e}
  .sid{margin-left:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#9ca3af}
```

The existing `.pill` rule (background `#eef2ff`, color `#4338ca`) is the base; `.pill.done` and `.pill.wip` override only the colors.

- [ ] **Step 3: Render the `<tr class="sessions-row">` for each client**

Inside `resultPage`, find the existing Clients table template literal — the block that opens with:

```ts
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
```

Replace the `.map((c) => ...)` body so each client emits **two** `<tr>`s back-to-back:

```ts
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
```

Notes:
- The full `session_id` goes into the row's `title` attribute (hover tooltip) and is the only place it appears unescaped-in-length. The visible `.sid` span only shows the first 8 characters plus `…`.
- The empty-state row uses the existing `<tr class="empty"><td>` pattern so the same `table.sessions` CSS applies.
- The outer existing `<script>` that handles `button.session` clicks is left unchanged — it walks up from the button with `.closest("tr")`, which still finds the same client `<tr>` (not the sessions-row). The new `<tr class="sessions-row">` has no button, so the click handler ignores it.

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors. (Note: `select_and_lookup.ts` is not yet updated to produce `ClientWithSessions` — if `tsc` flags the existing `blocks.clients = IMAGINARY_CLIENTS` assignment as incompatible, that's OK and the next task fixes it. If you want a clean intermediate state, you can leave Task 2 uncommitted and combine it with Task 3.)

If `tsc` does flag the assignment, skip to Task 3 first and come back to commit both together. Otherwise commit Task 2 cleanly.

- [ ] **Step 5: Commit (if Task 2 type-checks alone)**

```bash
git add templates.ts
git commit -m "$(cat <<'EOF'
feat: render per-investor sessions sub-table in resultPage

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If Step 4 reported a type error in `select_and_lookup.ts`, don't commit yet — proceed to Task 3 and commit both files together with a combined message:

```bash
git add templates.ts select_and_lookup.ts
git commit -m "$(cat <<'EOF'
feat: render per-investor sessions sub-table on /pick result page

Add ClientWithSessions shape carrying SQLite-derived sessions per imaginary
client; handlePick decorates each client; resultPage renders a nested
status-only sub-table beneath each Clients row.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(Task 3 below repeats this combined-commit option in its own steps; pick one path.)

---

## Task 3: Decorate clients with sessions in `handlePick`

**Files:**
- Modify: `select_and_lookup.ts`

A single one-line change inside `handlePick`, plus the import update.

- [ ] **Step 1: Update the `db.ts` import**

Find the existing line in `select_and_lookup.ts` near the top:

```ts
import { recordOtherCall, recordSessionCall } from "./db.ts";
```

Replace with:

```ts
import { listSessionsForInvestorEmail, recordOtherCall, recordSessionCall } from "./db.ts";
```

- [ ] **Step 2: Decorate the clients array**

Inside `handlePick`, find the block (inside `if (matched?.advisor_id) { ... }`):

```ts
        if (matched?.advisor_id) {
            blocks.advisorId = matched.advisor_id;
            blocks.clients = IMAGINARY_CLIENTS;
            console.log(`[pick] saved advisor_id=${matched.advisor_id}`);
        } else {
```

Replace the `blocks.clients = IMAGINARY_CLIENTS;` line with:

```ts
        if (matched?.advisor_id) {
            blocks.advisorId = matched.advisor_id;
            const advisorId = matched.advisor_id;
            blocks.clients = IMAGINARY_CLIENTS.map((c) => ({
                ...c,
                sessions: listSessionsForInvestorEmail(advisorId, c.email),
            }));
            console.log(`[pick] saved advisor_id=${matched.advisor_id}`);
        } else {
```

Notes:
- The local `const advisorId = matched.advisor_id` hoists out the value so the `.map` arrow doesn't re-narrow `matched` per iteration. It also makes the type cleanly `string` (rather than `string | undefined`) inside the closure under `noUncheckedIndexedAccess`.
- Five SQLite reads (one per imaginary client) run synchronously here. Each is sub-millisecond on a local file.

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Smoke-test the full server**

```bash
rm -rf data/
bun run select_and_lookup.ts
```

In another terminal, hit `/pick` and inspect the HTML for the new markup:

```bash
curl -s "http://localhost:9090/pick?user=0" | grep -E 'sessions-row|No sessions yet|class="pill (done|wip)"' | head -20
```

Expected: at least 5 lines matching `sessions-row` (one per imaginary client) and 5 lines matching `No sessions yet` (since the DB is empty). No matches for `pill done` or `pill wip`.

Then open `http://localhost:9090/pick?user=0` in a browser to confirm:
- Each imaginary client row in the Clients table is followed by a slightly indented light-grey sub-row.
- The sub-row contains a single italic muted "No sessions yet" line.
- The original "Create session" button still works (click one and confirm the popup opens to the session URL).

Stop the server (`Ctrl-C`).

- [ ] **Step 5: Smoke-test with data**

Boot the server again, hit `/pick?user=0`, click "Create session" for one client. After the popup opens, refresh `/pick?user=0`. That client's sub-table should now show a yellow `in progress` pill plus a muted 8-character `session_id` prefix. Hovering the row should reveal the full id in the browser tooltip.

(Optional, requires real webhook flow: trigger `qap.advice_session.completed` for that session in QAP test, refresh `/pick?user=0`, the pill should turn green and read `completed`.)

Stop the server.

- [ ] **Step 6: Commit**

If Task 2 was committed separately, this task commits only `select_and_lookup.ts`:

```bash
git add select_and_lookup.ts
git commit -m "$(cat <<'EOF'
feat: attach per-investor sessions to clients in handlePick

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If Task 2 was held back due to a transient type error, commit both files together using the combined message shown at the end of Task 2.

---

## Task 4: End-to-end verification

**Files:**
- (Verification only — no edits)

Repeat the spec's manual testing steps end-to-end.

- [ ] **Step 1: Empty-DB state**

```bash
rm -rf data/
bun run select_and_lookup.ts
```

Visit `http://localhost:9090/pick?user=0` against an advisor email that exists in QAP test. Every imaginary client's sub-table should render "No sessions yet" exactly once.

- [ ] **Step 2: One in-progress session**

Click "Create session" on one client (e.g. Erik Larsen). After the popup opens to the session URL, refresh `/pick?user=0`. That client's sub-row should now contain one entry with a yellow `in progress` pill and a muted truncated `session_id`. All other clients still show "No sessions yet".

- [ ] **Step 3: Completed session (optional, requires webhook)**

Complete the session in the QAP test environment so the `qap.advice_session.completed` webhook fires against `/listener`. Wait a few seconds for `handleSessionCompleted` to finish. Refresh `/pick?user=0`. The earlier `in progress` pill should now read `completed` (green).

- [ ] **Step 4: Multiple sessions, newest-first ordering**

Click "Create session" for the same client a second time. Refresh `/pick?user=0`. The sub-table should now show two rows for that client, with the newer session at the top.

- [ ] **Step 5: Cross-advisor isolation**

If you have a second user/advisor configured, repeat `/pick?user=N` for that advisor. Sessions created under user 0's advisor should not appear under user N's clients (the SQL filters by `advisor_id`).

- [ ] **Step 6: Tooltip / copyability**

Hover any session row in the browser. The `title` attribute should pop up showing the full `session_id`. Try right-click → Inspect to confirm the `<tr title="...">` carries the full id.

- [ ] **Step 7: No commit needed**

Verification only. If any step failed, return to the relevant task and fix.

---

## Done criteria

- `bunx tsc --noEmit` clean.
- `db.ts` exports `listSessionsForInvestorEmail` and `InvestorSessionRow`.
- `templates.ts` defines `ClientWithSessions` and renders one `<tr class="sessions-row">` per client inside the Clients table.
- `select_and_lookup.ts` produces `ClientWithSessions[]` from `IMAGINARY_CLIENTS` when an `advisor_id` is found.
- Visiting `/pick?user=N` (with an advisor resolvable in QAP) shows the Clients table with a nested sessions sub-table for every imaginary client, including "No sessions yet" for clients with no prior sessions.
- Two or three commits on top of `7c6ab0c` (the spec commit): the DB helper, then either one combined commit for templates + handlePick or two separate commits.
