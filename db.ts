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
