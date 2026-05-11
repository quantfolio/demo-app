# API Scratchpad — Design

## Purpose

A minimal Bun project that gives the user a personal "curl replacement" workflow: poke at an API in a scratchpad file, then save the working request as a standalone TypeScript script for later reuse. Doubles as a hands-on intro to Bun.

## Non-Goals

- No CLI wrapper or interactive prompt to compose requests.
- No request library — native `fetch` only.
- No env-var loader, no `.env` parsing helper.
- No test setup, no formatter config.
- No Postman-style collection UI or saved-request browser.

## File Layout

```
demo_App/
├── package.json
├── tsconfig.json
├── scratch.ts
├── scripts/
│   └── example.ts
└── README.md
```

## File Contents

### `package.json`
- `"type": "module"`
- `"name": "api-scratchpad"`, private, no version churn
- `devDependencies`: `bun-types`, `typescript`
- No `scripts` block beyond what Bun handles natively (user runs `bun <file>` directly)

### `tsconfig.json`
Bun's recommended config: ESNext target/module, `moduleResolution: bundler`, strict on, `types: ["bun-types"]`, `noEmit: true`. Bun executes TS directly — no build step.

### `scratch.ts`
A working starter request against a public API (e.g. `https://httpbin.org/get` or `https://api.github.com/zen`). Uses top-level `await`, native `fetch`, prints the response. Inline comments point out: top-level await works without wrapping in `async`, `fetch` is global in Bun, `Bun.write` exists if the user wants to save bodies to disk.

### `scripts/example.ts`
The same kind of request, but structured as the canonical pattern:

```ts
export async function example() {
  const res = await fetch("...");
  return res.json();
}

if (import.meta.main) {
  console.log(await example());
}
```

Demonstrates: file is runnable via `bun scripts/example.ts` AND importable from elsewhere — the user picks how to use it later.

### `README.md`
Ten-ish lines covering:
1. Install: `bun install`
2. Try the scratchpad: `bun scratch.ts`
3. Try the example script: `bun scripts/example.ts`
4. Workflow: edit `scratch.ts` → when happy, save-as into `scripts/<name>.ts` → run with `bun scripts/<name>.ts`
5. Note that scripts can also be imported as modules later

## Workflow

1. User edits `scratch.ts` to compose a request.
2. User runs `bun scratch.ts`, sees response.
3. Once satisfied, user copies file to `scripts/<descriptive-name>.ts` and adapts to the export pattern.
4. Saved scripts can be re-run (`bun scripts/foo.ts`) or imported into future code.

## What This Teaches About Bun

- Lean `package.json`, no build pipeline.
- TypeScript runs natively — no `tsc`, no `ts-node`.
- Top-level `await`.
- Global `fetch` and `Bun.write`.
- The `import.meta.main` idiom for dual-mode files.

## Open Questions

None — scope is tight and approved verbally.
