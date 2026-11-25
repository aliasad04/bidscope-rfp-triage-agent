import { createHash } from "node:crypto";
import { generateJson } from "./llm";
import { DEFAULT_PROFILE, MAX_PROFILE_CHARS } from "./profile";
import { SCREEN_PROMPT, SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import { AnalysisSchema, ScreenSchema, toGeminiJsonSchema, type Analysis, type Screen } from "./schema";
import { scoreAnalysis } from "./score";
import { DocIndex, annotateQuotes, checkDate } from "./verify";
import type { Report } from "./report";

export const SCHEMA_VERSION = "1.1";
const MAX_DOC_CHARS = 900_000; // ~225k tokens - comfortably covers a 100+ page RFP
const MIN_DOC_CHARS = 300; // below this the PDF is almost certainly a scan
const SCREEN_CHARS = 12_000;

const analysisJsonSchema = toGeminiJsonSchema(AnalysisSchema);
const screenJsonSchema = toGeminiJsonSchema(ScreenSchema);

export interface AnalyzeInput {
  fileName: string;
  pages: string[];
  profile?: string;
}

export type ProgressEvent =
  | { type: "progress"; step: "screen" | "analyze" | "verify"; message: string }
  | { type: "screen"; data: Screen & { model: string; elapsed_ms: number } };

export function cleanPages(pages: string[]): string[] {
  return pages.map((p) => p.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim());
}

export function buildDocText(pages: string[]): string {
  const text = pages.map((p, i) => `[PAGE ${i + 1}]\n${p}`).join("\n\n");
  return text.length > MAX_DOC_CHARS ? text.slice(0, MAX_DOC_CHARS) + "\n[TRUNCATED]" : text;
}

export function validateInput(input: AnalyzeInput): string | null {
  if (!Array.isArray(input.pages) || input.pages.length === 0) return "The PDF has no pages.";
  if (input.pages.some((p) => typeof p !== "string")) return "Malformed page text.";
  const chars = input.pages.reduce((n, p) => n + p.length, 0);
  if (chars < MIN_DOC_CHARS) {
    return "This PDF has almost no extractable text. It is probably a scanned image; please upload a text-based PDF.";
  }
  if (input.profile && input.profile.length > MAX_PROFILE_CHARS) return `Company profile is longer than ${MAX_PROFILE_CHARS} characters.`;
  return null;
}

// Per-instance memo so re-uploading the same RFP with the same profile is instant and spends no quota.
const cache = new Map<string, Report>();
const CACHE_LIMIT = 30;

function parseModelJson<T>(text: string, schema: { parse: (v: unknown) => T }, what: string): T {
  try {
    return schema.parse(JSON.parse(text));
  } catch (err) {
    throw new Error(`The model returned an invalid ${what}: ${(err as Error).message.slice(0, 300)}`);
  }
}

export async function analyzeRfp(input: AnalyzeInput, onEvent: (e: ProgressEvent) => void = () => {}): Promise<Report> {
  const started = Date.now();
  const pages = cleanPages(input.pages);
  const profile = input.profile?.trim() || DEFAULT_PROFILE;
  const docText = buildDocText(pages);
  const today = new Date().toISOString().slice(0, 10);

  const key = createHash("sha256").update(SCHEMA_VERSION).update(profile).update(docText).digest("hex");
  const cached = cache.get(key);
  if (cached) return { ...cached, file_name: input.fileName, cached: true };

  onEvent({ type: "progress", step: "screen", message: `Read ${pages.length} pages. Running a quick domain screen…` });

  // The quick screen runs alongside the full read so a clear no-bid shows up in a few seconds.
  const screenTask = generateJson({
    kind: "screen",
    system: SCREEN_PROMPT,
    prompt: `<company_profile>\n${profile}\n</company_profile>\n\n<rfp_excerpt>\n${docText.slice(0, SCREEN_CHARS)}\n</rfp_excerpt>`,
    jsonSchema: screenJsonSchema,
    timeoutMs: 15_000,
  })
    .then(({ text, model }) => {
      const data = parseModelJson(text, ScreenSchema, "screen");
      onEvent({ type: "screen", data: { ...data, model, elapsed_ms: Date.now() - started } });
    })
    .catch((err) => console.warn("[screen] skipped:", (err as Error).message)); // the screen is a nice-to-have

  onEvent({ type: "progress", step: "analyze", message: "Reading every page: dates, requirements, fine print…" });
  const { text, model } = await generateJson({
    kind: "analysis",
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(docText, profile, today),
    jsonSchema: analysisJsonSchema,
    timeoutMs: 110_000, // Gemini gets 75s of this when the Mistral backup is configured
  });
  const analysis: Analysis = parseModelJson(text, AnalysisSchema, "report");
  await screenTask;

  onEvent({ type: "progress", step: "verify", message: "Checking every quote and date against the PDF…" });
  const report = buildReport(analysis, pages, { fileName: input.fileName, model, started, profile });

  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, report);
  return report;
}

function buildReport(
  analysis: Analysis,
  pages: string[],
  meta: { fileName: string; model: string; started: number; profile: string },
): Report {
  const doc = new DocIndex(pages);
  const tally = { total: 0, verified: 0 };
  const verified = structuredClone(analysis) as Report["analysis"];
  annotateQuotes(verified, doc, tally);

  let dateMismatches = 0;
  for (const d of verified.key_dates) {
    d.date_check = checkDate(d.date_iso, d.as_written, doc);
    if (d.date_check === "mismatch" || d.date_check === "not_in_document") dateMismatches++;
  }

  const score = scoreAnalysis(analysis);
  const current = verified.key_dates.filter((d) => d.status !== "superseded");

  return {
    schema_version: SCHEMA_VERSION,
    // Top-level fields follow the output shape in the challenge brief.
    decision: score.decision,
    fit_score: score.fit_score,
    deadlines: current.map((d) => ({
      what: d.event,
      date: d.date_iso ?? d.as_written,
      time: d.time,
      mandatory: d.mandatory,
      page: d.page,
    })),
    requirements: verified.requirements.map((r) => ({
      category: r.category,
      requirement: r.requirement,
      mandatory: r.mandatory,
      company_status: r.company_status,
      page: r.page,
    })),
    reasons: verified.recommendation.reasons.slice(0, 3),
    bid_effort: { level: verified.bid_effort.level, summary: verified.bid_effort.summary },
    fast_no_bid: score.fast_no_bid,
    score_breakdown: score.breakdown,
    policy_notes: score.policy_notes,
    verification: { quotes_checked: tally.total, quotes_verified: tally.verified, date_issues: dateMismatches },
    file_name: meta.fileName,
    page_count: pages.length,
    model: meta.model,
    elapsed_ms: Date.now() - meta.started,
    generated_at: new Date().toISOString(),
    profile_used: meta.profile,
    cached: false,
    analysis: verified,
  };
}
