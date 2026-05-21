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

test("commRowHtml renders an expandable api_out row", async () => {
  const { commRowHtml } = await import("./templates.ts");
  const html = commRowHtml(
    { id: 1, kind: "api_out", label: "GET /v1/advisor", session_id: null,
      status: null, request_body: '{"a":1}', response_body: '{"b":2}',
      meta: null, timestamp: "2026-05-21T00:00:00.000Z" },
    new Set<string>(),
  );
  expect(html).toContain("GET /v1/advisor");
  expect(html).toContain("evt-api_out");
  expect(html).toContain("<details");
});

test("commRowHtml links an incomplete session-create row to its sessionUrl", async () => {
  const { commRowHtml } = await import("./templates.ts");
  const html = commRowHtml(
    { id: 2, kind: "api_out", label: "POST /v1/state_session", session_id: "live1",
      status: null, request_body: null, response_body: '{"session_id":"live1"}',
      meta: '{"sessionUrl":"https://session.test/live1"}', timestamp: "2026-05-21T00:00:00.000Z" },
    new Set<string>(),
  );
  expect(html).toContain('href="https://session.test/live1"');
  expect(html).toContain('target="_blank"');
});

test("commRowHtml does not link a completed session-create row", async () => {
  const { commRowHtml } = await import("./templates.ts");
  const html = commRowHtml(
    { id: 3, kind: "api_out", label: "POST /v1/state_session", session_id: "done1",
      status: null, request_body: null, response_body: '{"session_id":"done1"}',
      meta: '{"sessionUrl":"https://session.test/done1"}', timestamp: "2026-05-21T00:00:00.000Z" },
    new Set<string>(["done1"]),
  );
  expect(html).not.toContain('href="https://session.test/done1"');
});

test("commRowHtml links a /download row to the report route", async () => {
  const { commRowHtml } = await import("./templates.ts");
  const html = commRowHtml(
    { id: 4, kind: "api_out", label: "POST /v1/report/{investor_id}/{session_id}/download",
      session_id: "rep1", status: null, request_body: null,
      response_body: '{"path":"session_rep1.pdf"}', meta: null,
      timestamp: "2026-05-21T00:00:00.000Z" },
    new Set<string>(),
  );
  expect(html).toContain('href="/report?session=rep1"');
});

test("logPage renders all supplied rows", async () => {
  const { logPage } = await import("./templates.ts");
  const html = logPage(
    [{ id: 1, kind: "webhook_in", label: "qap.advice_session.completed",
       session_id: "s1", status: null, request_body: null, response_body: null,
       meta: null, timestamp: "2026-05-21T00:00:00.000Z" }],
    new Set<string>(),
  );
  expect(html).toContain("<!DOCTYPE html>");
  expect(html).toContain("qap.advice_session.completed");
  expect(html).toContain("EventSource");
});
