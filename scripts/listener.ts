// Tiny echo server. POST /listener returns the request as JSON.
//
// Run directly:    bun scripts/listener.ts
// Or import it:    import { startListener } from "./scripts/listener.ts";
//                  const server = startListener({ port: 4000 });
//                  // ...later:  server.stop();

export function startListener(opts: { port?: number } = {}) {
  const port = opts.port ?? Number(Bun.env.PORT ?? 3000);

  return Bun.serve({
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

        return Response.json(echo);
      }

      return new Response("not found", { status: 404 });
    },
  });
}

if (import.meta.main) {
  const server = startListener();
  console.log(`listening on http://localhost:${server.port}`);
}
