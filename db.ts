import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { publish } from "./comm-stream.ts";

export type CommKind = "webhook_in" | "api_out" | "oauth";

export interface CommLogRow {
  id: number;
  kind: CommKind;
  label: string;
  session_id: string | null;
  status: string | null;
  request_body: string | null;
  response_body: string | null;
  meta: string | null;
  timestamp: string;
}

export interface CommEntry {
  kind: CommKind;
  label: string;
  sessionId?: string;
  status?: string | number;
  requestBody?: unknown;
  responseBody?: unknown;
  meta?: Record<string, unknown>;
}

const DB_PATH = Bun.env.QAP_DB_PATH ?? "data/qap.sqlite";

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

  CREATE TABLE IF NOT EXISTS comm_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    kind          TEXT NOT NULL,
    label         TEXT NOT NULL,
    session_id    TEXT,
    status        TEXT,
    request_body  TEXT,
    response_body TEXT,
    meta          TEXT,
    timestamp     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_comm_log_session ON comm_log(session_id);
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

const insertComm = db.prepare(`
  INSERT INTO comm_log
    (kind, label, session_id, status, request_body, response_body, meta, timestamp)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  RETURNING id, kind, label, session_id, status, request_body, response_body, meta, timestamp
`);

const selectComm = db.prepare(`
  SELECT id, kind, label, session_id, status, request_body, response_body, meta, timestamp
  FROM comm_log
  ORDER BY id DESC
  LIMIT ?
`);

const selectCompletedSessions = db.prepare(`
  SELECT DISTINCT session_id FROM comm_log
  WHERE kind = 'webhook_in'
    AND label = 'qap.advice_session.completed'
    AND session_id IS NOT NULL
`);

const selectSessionsForInvestorEmail = db.prepare(`
  SELECT
    json_extract(s.response_body, '$.session_id') AS session_id,
    EXISTS (
      SELECT 1 FROM session_api_calls c
      WHERE c.session_id = json_extract(s.response_body, '$.session_id')
    ) AS completed,
    (
      SELECT json_extract(cl.meta, '$.sessionUrl')
      FROM comm_log cl
      WHERE cl.label = 'POST /v1/state_session'
        AND cl.session_id = json_extract(s.response_body, '$.session_id')
        AND json_extract(cl.meta, '$.sessionUrl') IS NOT NULL
      ORDER BY cl.id DESC
      LIMIT 1
    ) AS session_url
  FROM other_api_calls s
  WHERE s.api_endpoint = 'POST /v1/state_session'
    AND s.advisor_id = ?
    AND json_extract(s.response_body, '$.session_id') IS NOT NULL
    AND s.investor_id IN (
      SELECT json_extract(response_body, '$.id')
      FROM other_api_calls
      WHERE api_endpoint = 'POST /v1/investor'
        AND advisor_id = ?
        AND LOWER(json_extract(request_body, '$.email')) = LOWER(?)
      UNION
      SELECT json_extract(inv.value, '$.id')
      FROM other_api_calls li,
           json_each(json_extract(li.response_body, '$.investors')) inv
      WHERE li.api_endpoint = 'GET /v1/investor'
        AND li.advisor_id = ?
        AND json_extract(li.response_body, '$.investors') IS NOT NULL
        AND LOWER(json_extract(inv.value, '$.email')) = LOWER(?)
    )
  ORDER BY s.id DESC
`);

const selectApiCallsForSession = db.prepare(`
  SELECT id, api_endpoint, request_body, response_body, timestamp
  FROM session_api_calls
  WHERE session_id = ?
  ORDER BY id ASC
`);

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
      session_url: string | null;
    }>;
    return sessions.map((s) => ({
      session_id: s.session_id,
      completed: s.completed === 1,
      sessionUrl: s.session_url ?? null,
      calls: selectApiCallsForSession.all(s.session_id) as ApiCallRow[],
    }));
  } catch (e) {
    console.error("[db] listSessionsForInvestorEmail failed:", e);
    return [];
  }
}

function stringifyOrNull(value: unknown): string | null {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

export function recordSessionCall(
  sessionId: string,
  apiEndpoint: string,
  requestBody: unknown,
  responseBody: unknown,
  meta?: Record<string, unknown>,
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
  logComm({
    kind: "api_out",
    label: apiEndpoint,
    sessionId,
    requestBody,
    responseBody,
    meta,
  });
}

export function recordOtherCall(
  ctx: { advisorId?: string; investorId?: string },
  apiEndpoint: string,
  requestBody: unknown,
  responseBody: unknown,
  meta?: Record<string, unknown>,
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
  logComm({
    kind: "api_out",
    label: apiEndpoint,
    requestBody,
    responseBody,
    meta,
  });
}

export function logComm(entry: CommEntry): void {
  try {
    const sessionId =
      entry.sessionId ??
      ((entry.responseBody as { session_id?: string } | null | undefined)?.session_id ?? null);
    const row = insertComm.get(
      entry.kind,
      entry.label,
      sessionId,
      entry.status === undefined ? null : String(entry.status),
      stringifyOrNull(entry.requestBody),
      entry.responseBody === undefined ? null : JSON.stringify(entry.responseBody),
      entry.meta === undefined ? null : JSON.stringify(entry.meta),
      new Date().toISOString(),
    ) as CommLogRow;
    publish(row);
  } catch (e) {
    console.error("[db] logComm failed:", e);
  }
}

export function listComm(limit = 200): CommLogRow[] {
  try {
    return selectComm.all(limit) as CommLogRow[];
  } catch (e) {
    console.error("[db] listComm failed:", e);
    return [];
  }
}

export function completedSessionIds(): Set<string> {
  try {
    const rows = selectCompletedSessions.all() as Array<{ session_id: string }>;
    return new Set(rows.map((r) => r.session_id));
  } catch (e) {
    console.error("[db] completedSessionIds failed:", e);
    return new Set();
  }
}
