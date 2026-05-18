# SQLite API-call log — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every successful QAP API call (request payload + response body) made by `demo_App` into a local SQLite database via `bun:sqlite`, split across two tables — `session_api_calls` (when a `session_id` is in scope) and `other_api_calls` (advisor/investor flows). Drop the existing merged `session_<id>_data.json` dump; keep PDFs on disk and record their path + size.

**Architecture:** A new `db.ts` module opens a single SQLite database at `data/qap.sqlite`, applies the schema idempotently, and exports two synchronous recorder functions: `recordSessionCall` and `recordOtherCall`. The recorders are invoked from `select_and_lookup.ts` immediately after each `await client.X(...)` resolves successfully. `public_api/client.ts` is not modified. Only successful responses are logged; thrown exceptions skip the recorder by control flow.

**Tech Stack:** Bun (`bun:sqlite`), TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), `globalThis.fetch`. No new dependencies. No automated test suite (the project has none); verification is manual via `sqlite3` queries against `data/qap.sqlite` after exercising the server.

**Spec:** [docs/superpowers/specs/2026-05-18-sqlite-api-call-log-design.md](../specs/2026-05-18-sqlite-api-call-log-design.md)

---

## Background reading for the implementer

Before starting:

1. Read [docs/superpowers/specs/2026-05-18-sqlite-api-call-log-design.md](../specs/2026-05-18-sqlite-api-call-log-design.md) end-to-end. The "Call-site mapping" table is the source of truth for which endpoint label and request-payload shape goes with each `client.X(...)` call.
2. Skim [public_api/client.ts](../../../public_api/client.ts) to confirm method signatures used below. In particular, `downloadReportPdf(investorId, sessionId, body)` returns a `Response` (not bytes) — its body is the PDF.
3. Skim [select_and_lookup.ts](../../../select_and_lookup.ts) — all wiring changes happen there. The four functions you will touch are `handlePick` (~lines 160–207), `handleCreateSession` (~lines 238–306), `fetchSessionBundle` (~lines 314–344), and `handleSessionCompleted` (~lines 346–368).

Conventions to follow:
- Strict TypeScript. `verbatimModuleSyntax` means type-only imports must use `import type`.
- `noUncheckedIndexedAccess` is on — array indexing returns `T | undefined`.
- Do not modify `public_api/client.ts`.
- One commit per task. Use the commit messages shown.

---

## Task 1: Ignore the SQLite data directory

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add `data/` to `.gitignore`**

Open `.gitignore`. After the last line, append:

```gitignore
data/
```

Final file content:

```gitignore
node_modules
client/dist
.DS_Store
bun.lockb
*.log
.env
.env.local
.env.*.local
*.pdf
*.json
data/
```

- [ ] **Step 2: Verify**

Run: `git check-ignore -v data/qap.sqlite`
Expected: prints a line like `.gitignore:11:data/  data/qap.sqlite` confirming the rule matches.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore data/ directory for local SQLite store"
```

---

## Task 2: Create the `db.ts` module

**Files:**
- Create: `db.ts`

This module is self-contained: opens the database, applies the schema idempotently, and exports the two recorder functions. It is imported once from `select_and_lookup.ts`.

- [ ] **Step 1: Create `db.ts` with the full implementation**

Create `db.ts` with exactly this content:

```ts
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = "data/qap.sqlite";

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS session_api_calls (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    TEXT NOT NULL,
    api_endpoint  TEXT NOT NULL,
    request_body  TEXT,
    response_body TEXT NOT NULL,
    timestamp     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_session_api_calls_session
    ON session_api_calls(session_id);

  CREATE TABLE IF NOT EXISTS other_api_calls (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    advisor_id    TEXT,
    investor_id   TEXT,
    api_endpoint  TEXT NOT NULL,
    request_body  TEXT,
    response_body TEXT NOT NULL,
    timestamp     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_other_api_calls_advisor
    ON other_api_calls(advisor_id);
  CREATE INDEX IF NOT EXISTS idx_other_api_calls_investor
    ON other_api_calls(investor_id);
`);

const insertSession = db.prepare(`
  INSERT INTO session_api_calls
    (session_id, api_endpoint, request_body, response_body, timestamp)
  VALUES (?, ?, ?, ?, ?)
`);

const insertOther = db.prepare(`
  INSERT INTO other_api_calls
    (advisor_id, investor_id, api_endpoint, request_body, response_body, timestamp)
  VALUES (?, ?, ?, ?, ?, ?)
`);

function stringifyOrNull(value: unknown): string | null {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

export function recordSessionCall(
  sessionId: string,
  apiEndpoint: string,
  requestBody: unknown,
  responseBody: unknown,
): void {
  try {
    insertSession.run(
      sessionId,
      apiEndpoint,
      stringifyOrNull(requestBody),
      JSON.stringify(responseBody ?? null),
      new Date().toISOString(),
    );
  } catch (e) {
    console.error("[db] recordSessionCall failed:", e);
  }
}

export function recordOtherCall(
  ctx: { advisorId?: string; investorId?: string },
  apiEndpoint: string,
  requestBody: unknown,
  responseBody: unknown,
): void {
  try {
    insertOther.run(
      ctx.advisorId ?? null,
      ctx.investorId ?? null,
      apiEndpoint,
      stringifyOrNull(requestBody),
      JSON.stringify(responseBody ?? null),
      new Date().toISOString(),
    );
  } catch (e) {
    console.error("[db] recordOtherCall failed:", e);
  }
}
```

Notes for the implementer:
- `db.exec` runs all the `CREATE` statements in one call. `bun:sqlite` accepts multiple statements separated by `;`.
- `mkdirSync(..., { recursive: true })` is a no-op if the directory already exists.
- The try/catch in each recorder enforces the spec rule that a SQLite write failure must not break the user-facing API flow.
- Prepared statements are top-level so they are reused across calls.

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors. If TypeScript complains about missing types for `bun:sqlite`, confirm `"types": ["bun"]` is present in `tsconfig.json` (it already is).

- [ ] **Step 3: Smoke-test the module in isolation**

Run:

```bash
bun -e "
import { recordSessionCall, recordOtherCall } from './db.ts';
recordOtherCall({ advisorId: 'a1' }, 'GET /v1/advisor', { email: 'x@y.z' }, { advisors: [] });
recordSessionCall('s1', 'GET /v2/advice_session/{session_id}', { sessionId: 's1' }, { ok: true });
console.log('inserted');
"
```

Expected stdout: `inserted`. The `data/qap.sqlite` file should now exist.

Then verify schema and rows:

```bash
sqlite3 data/qap.sqlite ".schema"
sqlite3 data/qap.sqlite "SELECT advisor_id, api_endpoint, request_body, response_body, timestamp FROM other_api_calls;"
sqlite3 data/qap.sqlite "SELECT session_id, api_endpoint, request_body, response_body, timestamp FROM session_api_calls;"
```

Expected:
- `.schema` shows both tables and all three indexes.
- `other_api_calls` has one row: `a1|GET /v1/advisor|{"email":"x@y.z"}|{"advisors":[]}|<ISO timestamp>`.
- `session_api_calls` has one row: `s1|GET /v2/advice_session/{session_id}|{"sessionId":"s1"}|{"ok":true}|<ISO timestamp>`.

- [ ] **Step 4: Clean up the smoke-test DB**

Run: `rm -rf data/`

This guarantees the next task starts from an empty database, so verification rows in subsequent tasks are unambiguous.

- [ ] **Step 5: Commit**

```bash
git add db.ts
git commit -m "feat: add SQLite api-call log module (schema + recorders)"
```

---

## Task 3: Wire up recorders in `handlePick` and `handleCreateSession`

**Files:**
- Modify: `select_and_lookup.ts`

These are the two HTTP-request-driven handlers. All five client calls in them go into `other_api_calls`.

- [ ] **Step 1: Add the `db.ts` import**

In `select_and_lookup.ts`, find the import block at the top (lines 1–8). Add a new import line below the existing `templates.ts` import:

```ts
import { recordOtherCall, recordSessionCall } from "./db.ts";
```

(You will use `recordSessionCall` in Task 4; importing both now keeps the import block stable.)

- [ ] **Step 2: Instrument `handlePick`**

In `handlePick`, locate the `listAdvisors` call and the `createInvestor` call. Replace this block:

```ts
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
```

with:

```ts
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
            blocks.clients = IMAGINARY_CLIENTS;
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
```

Notes:
- The `req` variable is hoisted out so the same object goes to both the client method and the recorder — no risk of drift between what was sent and what is logged.
- `created` is now typed `{ id?: string }` locally so `created.id` is reachable for `recordOtherCall`.

- [ ] **Step 3: Instrument `handleCreateSession`**

In `handleCreateSession`, replace the body from the `try {` (around line 244) down to and including the `recordOtherCall` for `createStateSession`. Specifically, replace this block:

```ts
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
```

with:

```ts
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
        recordOtherCall(
            { advisorId, investorId },
            "POST /v1/state_session",
            createSessionReq,
            created,
        );
```

Notes:
- `createStateSession` row goes in `other_api_calls`, not `session_api_calls` — at call time we have `advisor_id` and `investor_id` but the `session_id` is being created by this very call. Subsequent webhook-driven calls (Task 4) will associate the returned `session_id` with rows in `session_api_calls`.
- The rest of `handleCreateSession` (the `rawLink`/`sessionUrl` derivation, the JSON response, the `catch`) is unchanged.

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Smoke-test the request handlers**

Boot the server (you'll need real `CLIENT_ID` / `CLIENT_SECRET` in `.env`):

```bash
bun run select_and_lookup.ts
```

In another terminal, exercise `/pick`:

```bash
curl -s "http://localhost:9090/pick?user=0" > /dev/null
```

Then verify the row was logged:

```bash
sqlite3 data/qap.sqlite "SELECT api_endpoint, advisor_id, investor_id, request_body FROM other_api_calls ORDER BY id;"
```

Expected: at least one row with `api_endpoint = GET /v1/advisor` and `request_body` containing the picked user's email as JSON. Depending on whether the advisor exists in QAP test, you'll either also see a `POST /v1/investor` row (no-advisor branch) or no second row.

Stop the server (`Ctrl-C`).

- [ ] **Step 6: Commit**

```bash
git add select_and_lookup.ts
git commit -m "feat: log handlePick + handleCreateSession API calls to SQLite"
```

---

## Task 4: Wire up recorders in `fetchSessionBundle` + `handleSessionCompleted`, drop the JSON dump, record PDF metadata

**Files:**
- Modify: `select_and_lookup.ts`

This task handles the webhook-driven flow. All calls go into `session_api_calls`. It also removes the merged `session_<id>_data.json` write and records PDF size from disk.

- [ ] **Step 1: Instrument `fetchSessionBundle`**

In `select_and_lookup.ts`, replace the body of `fetchSessionBundle` (the function starting around line 314). The full new function:

```ts
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
```

What changed vs. the original:
- The four top-level calls are no longer dispatched with `Promise.all`. They are awaited sequentially so each one can be recorded with the matching response before the next one starts. This is a minor latency cost (4 sequential GETs instead of parallel) acceptable for a scratchpad and required so the recorded `timestamp` reflects actual call order.
- `goalIds` is derived from the already-fetched `listAdviceGoalsRes` (renamed from `goals`) — same logic, different variable name.
- The per-goal `Promise.all` is kept parallel; the recorder runs inside each goal's async function so each per-goal row is written when that fetch returns.
- The returned object's keys match the original (`session`, `advice_information`, `goals`, `goal_details`, `transactions`) so `handleSessionCompleted` consumers are unchanged.

- [ ] **Step 2: Update `handleSessionCompleted` — record `getReport` and `downloadReportPdf`, drop the JSON dump**

Replace the entire body of `handleSessionCompleted` with:

```ts
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
```

What changed vs. the original:
- The merged `session_${sessionId}_data.json` write is gone. `fetchSessionBundle` is still called (it produces all the per-call rows) but its return value is discarded.
- `getReport` response is recorded.
- `downloadReportPdf` is recorded with a synthetic `response_body` of `{ path, size_bytes }`. `size_bytes` is read via `Bun.file(pdfPath).size` after the write — `Bun.file(...).size` is sync metadata, no second read.
- The PDF is still written to disk at the same path as before. Existing tooling that reads `session_<id>.pdf` keeps working.

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add select_and_lookup.ts
git commit -m "feat: log webhook-driven session API calls + PDF metadata to SQLite, drop JSON dump"
```

---

## Task 5: End-to-end verification

**Files:**
- (Verification only — no edits)

- [ ] **Step 1: Start with an empty DB**

```bash
rm -rf data/
```

- [ ] **Step 2: Boot the server**

```bash
bun run select_and_lookup.ts
```

Leave it running.

- [ ] **Step 3: Exercise the request flow**

In another terminal:

```bash
curl -s "http://localhost:9090/pick?user=0" > /dev/null
curl -s -X POST "http://localhost:9090/session" \
  -H "Content-Type: application/json" \
  -d '{"advisorId":"<paste from /pick HTML>","name":"Erik Larsen","email":"erik.larsen@example.com","country":"NO"}' \
  | head -c 200
```

If you don't have an advisorId handy, this is fine — you'll see the rows from `/pick` only. The goal is to populate `other_api_calls`.

- [ ] **Step 4: Trigger a `qap.advice_session.completed` webhook**

Either complete a real advice session in the QAP test environment so the webhook fires against `/listener`, or POST a synthetic event yourself:

```bash
curl -s -X POST "http://localhost:9090/listener" \
  -H "Content-Type: application/json" \
  -d '{"type":"qap.advice_session.completed","object_id":"<real session_id>","object_owner_id":"<real investor_id>"}'
```

(Use real ids from a completed session in QAP test, otherwise the chained `getAdviceSession` etc. will 404 and the recorder skips — that's expected behavior per the spec, but for verification you want a session that exists.)

Wait a few seconds for the background `handleSessionCompleted` to finish.

- [ ] **Step 5: Stop the server and inspect the database**

Stop the server (`Ctrl-C`), then:

```bash
sqlite3 data/qap.sqlite "SELECT api_endpoint, advisor_id, investor_id, request_body, timestamp FROM other_api_calls ORDER BY id;"
sqlite3 data/qap.sqlite "SELECT api_endpoint, session_id, request_body, substr(response_body, 1, 80) AS response_head, timestamp FROM session_api_calls ORDER BY id;"
```

Expected:
- `other_api_calls` contains rows for `GET /v1/advisor`, optionally `POST /v1/investor` and `GET /v1/investor` and `POST /v1/state_session` depending on which flows you exercised.
- `session_api_calls` contains rows for `GET /v2/advice_session/{session_id}`, `.../advice_information`, `.../goal`, `.../transactions`, zero or more `.../goal/{goal_id}` rows, `GET /v1/report/{investor_id}/{session_id}`, and one `POST /v1/report/{investor_id}/{session_id}/download` row whose `request_body` includes the `files` array.
- The PDF endpoint row's `response_body` is `{"path":"session_<id>.pdf","size_bytes":<N>}`. Verify the file exists on disk at that path:

```bash
ls -l session_*.pdf
```

- [ ] **Step 6: Verify no `session_<id>_data.json` was written**

```bash
ls session_*_data.json 2>/dev/null || echo "no JSON dump — correct"
```

Expected: `no JSON dump — correct`. If any `session_<id>_data.json` file exists, the JSON-dump removal in Task 4 was incomplete.

- [ ] **Step 7: Verify restart persistence**

```bash
sqlite3 data/qap.sqlite "SELECT COUNT(*) FROM other_api_calls; SELECT COUNT(*) FROM session_api_calls;"
```

Note the counts. Then re-boot the server briefly (`bun run select_and_lookup.ts`, `Ctrl-C` within a second), and re-run the same counts. The numbers must be unchanged — boot only re-applies the idempotent schema, it doesn't drop rows.

- [ ] **Step 8: No commit needed**

This task is verification only. If any step failed, return to the relevant task and fix.

---

## Done criteria

- `data/qap.sqlite` exists with both tables and three indexes.
- Every successful `client.X(...)` call in `handlePick`, `handleCreateSession`, `fetchSessionBundle`, and `handleSessionCompleted` produces a row in the correct table.
- PDF artifacts still land at `session_<sessionId>.pdf` on disk.
- No `session_<sessionId>_data.json` file is written.
- `bunx tsc --noEmit` is clean.
- Four commits on top of `eba41b1`: gitignore, db module, request-handler instrumentation, webhook-handler instrumentation.
