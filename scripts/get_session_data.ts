// Scratchpad. Edit this file, then run: bun scratch.ts
//
// Bun notes:
//   - `fetch` and `crypto` are globals (no imports).
//   - Top-level `await` works — no need for an async IIFE.
//   - `Bun.env` and `process.env` both expose env vars.
//   - Bun auto-loads `.env` from the project root — no dotenv package needed.
//   - `Bun.write(path, data)` saves anything to disk if you want to capture
//     a response body, e.g. `await Bun.write("out.json", await res.text())`.
//
// Workflow: when this request looks good, copy the file to
// `scripts/<name>.ts` and reshape it using the pattern in `scripts/example.ts`.

const apiToken = Bun.env.API_TOKEN;
if (!apiToken) {
  throw new Error("API_TOKEN is not set. Add it to .env");
}

// GET /api/v1/state/session/{session_id}/data — list a session's data entries.
//
// Path param:
//   session_id  uuid (required)
//
// Response 200 (StateDataListResponse):
//   { data: StateDataSchema[] }
export async function downloadSessionData(sessionId: string) {
  const url = `https://qap-api.test.deepalpha.dev/api/v1/state/session/${sessionId}/data`;

  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Accept": "application/json",
    },
  });

  console.log("status:", res.status);
  console.log("headers:", Object.fromEntries(res.headers));

  const rawBody = await res.text();
  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? JSON.parse(rawBody) : rawBody;

  console.log("body:", body);

  const outPath = `session_${sessionId}_data.json`;
  await Bun.write(outPath, rawBody);
  console.log("saved:", outPath);

  return body;
}

if (import.meta.main) {
  await downloadSessionData("REPLACE_WITH_SESSION_ID");
}
