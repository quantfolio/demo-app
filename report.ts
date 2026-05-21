// report.ts
export function handleReport(sessionId: string): Response {
  const path = `session_${sessionId}.pdf`;
  const file = Bun.file(path);
  if (!file.size) {
    return new Response("No report PDF for this session", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(file, { headers: { "Content-Type": "application/pdf" } });
}
