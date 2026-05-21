// report-route.test.ts
import { test, expect, afterAll } from "bun:test";
import { handleReport } from "./report.ts";

const PDF = "session_test-report-route.pdf";
afterAll(async () => { try { await Bun.file(PDF).delete(); } catch {} });

test("handleReport serves an existing PDF", async () => {
  await Bun.write(PDF, "%PDF-1.4 fake");
  const res = handleReport("test-report-route");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/pdf");
});

test("handleReport 404s for a missing session", () => {
  const res = handleReport("no-such-session");
  expect(res.status).toBe(404);
});
