import { GoogleGenAI, ThinkingLevel } from "@google/genai";

/**
 * Thin Gemini wrapper with a model fallback chain.
 *
 * Free-tier model names and quotas change often, so the app never depends on
 * one model id. It tries GEMINI_MODEL (if set), then a known-good list, then
 * any other Flash model the key can see (discovered via ListModels), moving on
 * when a model is missing (404), rate limited (429) or overloaded (5xx).
 * Anything else - a bad key, a malformed request - fails immediately.
 */

// Checked against the free tier in Nov 2026; 2.5 models are closed to new keys.
const DEFAULT_CHAIN = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.7-flash"];
// Lite models only: the optional quick screen must never spend the main models' per-minute quota.
const SCREEN_CHAIN = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

// LOW halves latency on the sample RFPs (~60s -> ~30s) with the same eval results.
const THINKING_LEVEL = (process.env.GEMINI_THINKING_LEVEL?.toUpperCase() || ThinkingLevel.LOW) as ThinkingLevel;

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to .env.local (local) or the hosting provider's environment variables.");
  }
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

function modelChain(kind: "analysis" | "screen"): string[] {
  const preferred = kind === "analysis" ? process.env.GEMINI_MODEL : process.env.GEMINI_SCREEN_MODEL;
  const chain = kind === "analysis" ? DEFAULT_CHAIN : SCREEN_CHAIN;
  return [...new Set([preferred, ...chain].filter((m): m is string => Boolean(m)))];
}

let discovered: Promise<string[]> | null = null;

/** Plain "gemini-X.Y-flash" / "-flash-lite" models visible to this key, newest first. */
function discoverFlashModels(): Promise<string[]> {
  discovered ??= (async () => {
    const names: string[] = [];
    for await (const m of await getClient().models.list()) {
      const name = m.name?.replace(/^models\//, "") ?? "";
      if (/^gemini-[\d.]+-flash(-lite)?$/.test(name) && (m.supportedActions ?? []).includes("generateContent")) names.push(name);
    }
    const version = (n: string) => parseFloat(n.split("-")[1]);
    return names.sort((a, b) => Number(a.endsWith("-lite")) - Number(b.endsWith("-lite")) || version(b) - version(a));
  })().catch((err) => {
    discovered = null;
    console.warn("[gemini] model discovery failed:", errorText(err).slice(0, 200));
    return [];
  });
  return discovered;
}

function errorText(err: unknown): string {
  return String((err as Error)?.message ?? err);
}

function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === 404 || status === 429 || (status !== undefined && status >= 500)) return true;
  return /\b(404|429|500|503)\b|not found|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded/i.test(errorText(err));
}

function isNotFound(err: unknown): boolean {
  return (err as { status?: number })?.status === 404 || /NOT_FOUND|no longer available/i.test(errorText(err));
}

function isOverloaded(err: unknown): boolean {
  return (err as { status?: number })?.status === 503 || /UNAVAILABLE|high demand|overloaded/i.test(errorText(err));
}

function isSchemaRejection(err: unknown): boolean {
  return !isRetryable(err) && /schema|too many states/i.test(errorText(err));
}

export interface JsonCallOptions {
  kind: "analysis" | "screen";
  system: string;
  prompt: string;
  jsonSchema: unknown;
  timeoutMs: number;
}

export interface JsonCallResult {
  text: string;
  model: string;
}

async function callOnce(model: string, opts: JsonCallOptions, timeoutMs: number, schemaInPrompt: boolean): Promise<JsonCallResult> {
  const res = await getClient().models.generateContent({
    model,
    contents: schemaInPrompt
      ? `${opts.prompt}\n\nReturn only JSON that conforms to this JSON Schema:\n${JSON.stringify(opts.jsonSchema)}`
      : opts.prompt,
    config: {
      systemInstruction: opts.system,
      responseMimeType: "application/json",
      ...(schemaInPrompt ? {} : { responseJsonSchema: opts.jsonSchema }),
      thinkingConfig: { thinkingLevel: THINKING_LEVEL },
      abortSignal: AbortSignal.timeout(timeoutMs),
    },
  });
  const text = res.text;
  if (!text) throw new Error(`Empty response from ${model} (finish reason: ${res.candidates?.[0]?.finishReason ?? "unknown"})`);
  return { text, model };
}

export async function geminiJson(opts: JsonCallOptions): Promise<JsonCallResult> {
  const deadline = Date.now() + opts.timeoutMs;
  // If a model rejects the schema as too complex for constrained decoding, fall
  // back to putting the schema in the prompt; zod still validates the result.
  let schemaInPrompt = false;
  let lastErr: unknown = null;
  const failure = () => lastErr ?? new Error("No Gemini model was available in time");
  const tried = new Set<string>();

  // A "model not found" from a late fallback must not hide the real cause (quota, overload).
  const remember = (err: unknown) => {
    if (lastErr === null || !isNotFound(err) || isNotFound(lastErr)) lastErr = err;
  };

  const tryModel = async (model: string): Promise<JsonCallResult | null> => {
    tried.add(model);
    let retriedOverload = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 3000) throw failure();
      try {
        return await callOnce(model, opts, remaining, schemaInPrompt);
      } catch (err) {
        remember(err);
        if (!schemaInPrompt && isSchemaRejection(err)) {
          console.warn(`[gemini] ${model} rejected the response schema; retrying with the schema in the prompt`);
          schemaInPrompt = true;
          continue;
        }
        // "High demand" spikes usually clear within seconds: one short retry before moving on.
        if (isOverloaded(err) && !retriedOverload && deadline - Date.now() > 20_000) {
          retriedOverload = true;
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        if (!isRetryable(err)) throw err;
        console.warn(`[gemini] ${model} failed, trying next model:`, errorText(err).slice(0, 200));
        return null;
      }
    }
    return null;
  };

  for (const model of modelChain(opts.kind)) {
    const result = await tryModel(model);
    if (result) return result;
  }
  // Every known model failed with a retryable error: ask the API what exists now (main analysis only).
  if (opts.kind === "screen") throw failure();
  for (const model of await discoverFlashModels()) {
    if (tried.has(model)) continue;
    const result = await tryModel(model);
    if (result) return result;
  }
  throw failure();
}
