// Tiny Bun HTTP server. Run: bun server.ts
//
// Bun notes:
//   - `Bun.serve({ port, fetch })` is the native HTTP entry point — no deps.
//   - The `fetch` handler takes a standard `Request` and returns a `Response`.
//   - Bun keeps the process alive automatically while the server is running;
//     no `.listen()` callback or event loop ceremony needed.

import { downloadSessionData } from "./scripts/get_session_data.ts";
import { downloadSessionPdf } from "./scripts/get_session_pdf.ts";

const port = Number(Bun.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/listener") {
      const contentType = req.headers.get("content-type") ?? "";
      const body = contentType.includes("application/json")
        ? await req.json().catch(() => null)
        : await req.text();

      const echo = {
        method: req.method,
        url: req.url,
        headers: Object.fromEntries(req.headers),
        body,
      };

      console.log("[listener]", JSON.stringify(echo, null, 2));

      const event = body as { type?: string; object_id?: string } | null;
      if (
        event?.type === "qap.advice_session.completed" &&
        typeof event.object_id === "string"
      ) {
        await downloadSessionData(event.object_id);
        await downloadSessionPdf(event.object_id);
      }

      return Response.json(echo);
    }

    return new Response("not found", { status: 404 });
  },
});

console.log(`listening on http://localhost:${server.port}`);
