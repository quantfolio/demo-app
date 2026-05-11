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

// POST /api/v1/state/session/{session_id}/generate_pdf — generate a PDF document.
//
// Path param:
//   session_id   uuid (required)
//
// Body (PdfPayload):
//   Required:
//     filename     string
//     template_id  string
//   Optional:
//     name                    string
//     language                string
//     attachments             AttachmentPdf[]
//     morningstar_attachments integer[]
//     product_attachments     boolean
//     sections                PdfSections
//
// Response 200: application/pdf (binary).
export async function downloadSessionPdf(sessionId: string) {
  const url = `https://qap-api.test.deepalpha.dev/api/v1/state/session/${sessionId}/generate_pdf`;

  const payload = { 
    "language": "no",
    "template_id": "shwarma", 
    "filename": "example_1.rml.pdf", 
    "product_attachments": false, 
    "sections": { }, 
    "attachments": [] 
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      "Accept": "application/pdf",
    },
    body: JSON.stringify(payload),
  });

  console.log("status:", res.status);
  console.log("headers:", Object.fromEntries(res.headers));

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.includes("application/pdf")) {
    const errBody = contentType.includes("application/json")
      ? await res.json()
      : await res.text();
    console.log("error body:", errBody);
    throw new Error(`PDF generation failed: ${res.status}`);
  }

  const outPath = `session_${sessionId}.pdf`;
  await Bun.write(outPath, res);
  console.log("saved:", outPath);
}

if (import.meta.main) {
  await downloadSessionPdf("REPLACE_WITH_SESSION_ID");
}
