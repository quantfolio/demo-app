// Scratchpad. Edit this file, then run: bun scratch.ts
//
// Bun notes baked into this file:
//   - `fetch` is a global (no import needed).
//   - Top-level `await` works — no need to wrap in an async IIFE.
//   - `Bun.write(path, data)` saves anything to disk if you want to capture
//     a response body, e.g. `await Bun.write("out.json", await res.text())`.
//
// Workflow: when this request looks good, copy the file to
// `scripts/<name>.ts` and reshape it using the pattern in `scripts/example.ts`.

const url = "https://qap-api.test.deepalpha.dev/api/v1/state/advisor";

const api_token = Bun.env.API_TOKEN;

const res = await fetch(url, {
  method: "GET",
  headers: {
    "Authorization": `Bearer ${api_token}`,
  },
});

console.log("status:", res.status);
console.log("headers:", Object.fromEntries(res.headers));

const contentType = res.headers.get("content-type") ?? "";
const body = contentType.includes("application/json")
  ? await res.json()
  : await res.text();

console.log("body:", body);
