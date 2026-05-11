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

const url = "https://qap-api.test.deepalpha.dev/api/v1/state/session";

const apiToken = Bun.env.API_TOKEN;
if (!apiToken) {
  throw new Error("API_TOKEN is not set. Add it to .env");
}

// POST /api/v1/state/session — create a new session.
//
// Schema (CreateStateSessionPayload):
//   Required:
//     advisor_id      string (uuid, max 36)
//     name            string (max 200)
//   Optional:
//     session_id              uuid (server generates if omitted)
//     investor_id             uuid
//     advice_type             "MiFIID II investment Advice" | "Order Execution"
//     external_status         string (max 30) | null
//     survey_status           "complete" | "waiting_for_investor"
//                             | "notification_error" | "reminder_sent" | null
//     survey_status_message   object | null
const payload = {
  advisor_id: "97fc3bb0-d490-426d-8b31-0cb53dff369a",
  name: "Scratch Session",
  investor_id: "d87784dc-fb26-451b-9092-c015c56ccac9",
  advice_type: "MiFIID II investment Advice" as const,
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
