// Pattern for saved API scripts.
//
// Run directly:    bun scripts/example.ts
// Or import it:    import { getZen } from "./scripts/example.ts";
//
// The `import.meta.main` check is true only when this file is the entry
// point Bun was invoked with — so the function runs on direct invocation
// but stays quiet when imported elsewhere.

export async function getZen(): Promise<string> {
  const res = await fetch("https://api.github.com/zen", {
    headers: { "User-Agent": "api-scratchpad" },
  });
  if (!res.ok) {
    throw new Error(`github /zen failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

if (import.meta.main) {
  console.log(await getZen());
}
