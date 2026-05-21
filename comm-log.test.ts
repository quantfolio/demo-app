// comm-log.test.ts
Bun.env.QAP_DB_PATH = ":memory:";
import { test, expect } from "bun:test";
const { logComm, listComm, completedSessionIds } = await import("./db.ts");

test("logComm inserts a row that listComm returns newest-first", () => {
  logComm({ kind: "api_out", label: "GET /v1/advisor", responseBody: { ok: true } });
  logComm({ kind: "webhook_in", label: "qap.advice_session.completed", sessionId: "s1" });
  const rows = listComm();
  expect(rows.length).toBe(2);
  expect(rows[0]!.label).toBe("qap.advice_session.completed");
  expect(rows[1]!.label).toBe("GET /v1/advisor");
});

test("listComm honours the limit argument", () => {
  expect(listComm(1).length).toBe(1);
});

test("logComm derives session_id from a responseBody.session_id", () => {
  logComm({ kind: "api_out", label: "POST /v1/state_session", responseBody: { session_id: "s2" } });
  expect(listComm(1)[0]!.session_id).toBe("s2");
});

test("completedSessionIds reflects completion webhooks only", () => {
  expect(completedSessionIds().has("s1")).toBe(true);
  expect(completedSessionIds().has("s2")).toBe(false);
});

test("recordSessionCall also writes an api_out comm_log row", async () => {
  const { recordSessionCall } = await import("./db.ts");
  recordSessionCall("sess-rec", "GET /v2/advice_session/{session_id}", { a: 1 }, { b: 2 });
  const row = listComm(1)[0]!;
  expect(row.kind).toBe("api_out");
  expect(row.label).toBe("GET /v2/advice_session/{session_id}");
  expect(row.session_id).toBe("sess-rec");
});

test("recordOtherCall also writes an api_out comm_log row with meta", async () => {
  const { recordOtherCall } = await import("./db.ts");
  recordOtherCall({ advisorId: "adv1" }, "POST /v1/state_session",
    { req: 1 }, { session_id: "s3" }, { sessionUrl: "https://example.test/s3" });
  const row = listComm(1)[0]!;
  expect(row.kind).toBe("api_out");
  expect(row.session_id).toBe("s3");
  expect(JSON.parse(row.meta!).sessionUrl).toBe("https://example.test/s3");
});
