// comm-stream.test.ts
import { test, expect } from "bun:test";
import { publish, subscribe } from "./comm-stream.ts";
import type { CommLogRow } from "./db.ts";

const sampleRow: CommLogRow = {
  id: 1, kind: "api_out", label: "GET /v1/advisor", session_id: null,
  status: null, request_body: null, response_body: "{}", meta: null,
  timestamp: "2026-05-21T00:00:00.000Z",
};

test("publish reaches a subscriber", () => {
  const seen: CommLogRow[] = [];
  const unsubscribe = subscribe((row) => seen.push(row));
  publish(sampleRow);
  expect(seen).toEqual([sampleRow]);
  unsubscribe();
});

test("unsubscribe stops further delivery", () => {
  const seen: CommLogRow[] = [];
  const unsubscribe = subscribe((row) => seen.push(row));
  unsubscribe();
  publish(sampleRow);
  expect(seen).toEqual([]);
});
