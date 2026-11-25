import { analyzeRfp, validateInput, type AnalyzeInput, type ProgressEvent } from "@/lib/analyze";
import { extractPages } from "@/lib/pdf-text";

export const runtime = "nodejs";
export const maxDuration = 150;

const MAX_PDF_BYTES = 4 * 1024 * 1024; // the host rejects request bodies above ~4.5 MB

/**
 * POST /api/analyze
 *   multipart/form-data: file=<PDF>, profile=<optional text>
 *   application/json:    { fileName, pages: string[], profile? }
 * Add ?stream=1 for newline-delimited JSON progress events (used by the UI);
 * otherwise the response is the plain JSON report.
 */
export async function POST(req: Request) {
  let input: AnalyzeInput;
  try {
    input = await readInput(req);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }

  const invalid = validateInput(input);
  if (invalid) return Response.json({ error: invalid }, { status: 422 });

  const stream = new URL(req.url).searchParams.get("stream") === "1";
  if (!stream) {
    try {
      return Response.json(await analyzeRfp(input));
    } catch (err) {
      return Response.json({ error: friendlyError(err) }, { status: 502 });
    }
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (obj: ProgressEvent | { type: "report"; data: unknown } | { type: "error"; message: string }) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const report = await analyzeRfp(input, send);
        send({ type: "report", data: report });
      } catch (err) {
        console.error("[analyze]", err);
        send({ type: "error", message: friendlyError(err) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function GET() {
  return Response.json({
    service: "RFP Triage Agent",
    usage: {
      pdf: "curl -F file=@rfp.pdf https://<host>/api/analyze",
      text: "POST application/json { fileName, pages: string[], profile?: string }",
      stream: "append ?stream=1 for NDJSON progress events",
    },
    configured: Boolean(process.env.GEMINI_API_KEY),
  });
}

async function readInput(req: Request): Promise<AnalyzeInput> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error('Send the PDF in a form field named "file".');
    if (file.size > MAX_PDF_BYTES) throw new Error("PDF is larger than 4 MB. Use the web UI, which extracts text in the browser.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") throw new Error("That file is not a PDF.");
    const profile = form.get("profile");
    return { fileName: file.name, pages: await extractPages(bytes), profile: typeof profile === "string" ? profile : undefined };
  }
  if (type.includes("application/json")) {
    const json = (await req.json()) as Partial<AnalyzeInput>;
    return { fileName: String(json.fileName ?? "rfp.pdf"), pages: json.pages ?? [], profile: json.profile };
  }
  throw new Error("Send multipart/form-data with a PDF, or JSON with extracted pages.");
}

function friendlyError(err: unknown): string {
  const msg = String((err as Error)?.message ?? err);
  if (/GEMINI_API_KEY/.test(msg)) return msg;
  if (/Backup \(\w+\) also failed/.test(msg)) return "Both AI providers (Gemini and the backup) are unavailable right now. Please try again in a minute.";
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) return "The free AI quota is used up for the moment. Wait a minute and try again.";
  if (/503|UNAVAILABLE|high demand|overloaded/i.test(msg)) return "Google's AI models are very busy right now. Please try again in a minute.";
  if (/API key not valid|PERMISSION_DENIED|401|403/i.test(msg)) return "The Gemini API key was rejected. Check GEMINI_API_KEY.";
  if (/abort|timeout/i.test(msg)) return "The AI model took too long to answer. Please try again.";
  return msg.slice(0, 400);
}
