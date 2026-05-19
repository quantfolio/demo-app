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
