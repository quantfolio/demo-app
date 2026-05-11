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

const url = "https://qap-api.test.deepalpha.dev/api/v1/state/advisor";

const apiToken = Bun.env.API_TOKEN;
if (!apiToken) {
  throw new Error("API_TOKEN is not set. Add it to .env");
}

// POST /api/v1/state/advisor — create an advisor.
// Schema (CreateStateAdvisorPayload):
//   name         string  (required, max 55)
//   advisor_id   string  (optional, uuid, max 36)
//   email        string  (optional, email, max 150)
//   external_id  string  (optional, max 150)
const payload = {
  name: "Scratch Advisor.2",
  advisor_id: crypto.randomUUID(),
  email: "scratch.2@example.com",
};

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

console.log("status:", res.status);
console.log("headers:", Object.fromEntries(res.headers));

const contentType = res.headers.get("content-type") ?? "";
const body = contentType.includes("application/json")
  ? await res.json()
  : await res.text();

console.log("body:", body);
