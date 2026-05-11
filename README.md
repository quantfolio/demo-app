# api-scratchpad

A personal "curl replacement" workflow in Bun. Poke at an API in `scratch.ts`,
then save the working request as a standalone script in `scripts/` for reuse.

## Setup

```sh
bun install
```

## Workflow

1. **Try a request.** Edit `scratch.ts` with the URL/headers/body you want, then:
   ```sh
   bun scratch.ts
   ```
2. **Save it.** When the request looks right, copy `scratch.ts` to
   `scripts/<descriptive-name>.ts` and reshape it using the pattern in
   `scripts/example.ts` — wrap the call in an exported function and keep the
   `if (import.meta.main)` block.
3. **Re-run any saved script** directly:
   ```sh
   bun scripts/example.ts
   ```
4. **Or import it** from other code later:
   ```ts
   import { getZen } from "./scripts/example.ts";
   ```

## Echo server

`server.ts` exposes `POST /listener` which echoes the request as JSON:

```sh
bun server.ts                           # listens on :3000 (override with PORT)

curl -sS -X POST http://localhost:3000/listener \
  -H "Content-Type: application/json" \
  -H "X-Demo: hello" \
  -d '{"foo":"bar"}'
```

Returns `{ method, url, headers, body }`.

## Layout

```
.
├── scratch.ts          # edit-run-iterate scratchpad
├── server.ts           # tiny Bun.serve() echo server
├── scripts/            # saved API scripts (one per call)
│   └── example.ts
├── package.json
└── tsconfig.json
```

No build step — Bun runs TypeScript directly.
