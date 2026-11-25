/**
 * Backup providers, used only when every Gemini model is unavailable (or when
 * LLM_PROVIDER forces one). Both speak the OpenAI-style chat completions API
 * with JSON Schema structured output, so they share one client over fetch.
 *
 * - OpenRouter: free models, no card (preferred; set OPENROUTER_API_KEY).
 * - Mistral: needs a paid plan as of Nov 2026 (set MISTRAL_API_KEY).
 */

interface Provider {
  name: "openrouter" | "mistral";
  endpoint: string;
  keyEnv: string;
  modelEnv: string;
  models: string[];
  extraBody?: Record<string, unknown>;
}

const PROVIDERS: Provider[] = [
  {
    name: "openrouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    keyEnv: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL",
    // Free, long-context models that passed a structured-output check in Nov 2026;
    // "openrouter/free" lets OpenRouter pick any free model as a last resort.
    models: ["nvidia/nemotron-3.5-super-vl:free", "inclusionai/ling-3.2-flash:free", "openrouter/free"],
    // With reasoning on, Nemotron spent ~110s thinking on a 12-page RFP; off, it
    // returned the same correct report in ~47s.
    extraBody: { reasoning: { enabled: false }, max_tokens: 16000 },
  },
  {
    name: "mistral",
    endpoint: "https://api.mistral.ai/v1/chat/completions",
    keyEnv: "MISTRAL_API_KEY",
    modelEnv: "MISTRAL_MODEL",
    models: ["mistral-medium-latest", "mistral-small-latest"],
  },
];

export function backupProvider(): Provider | null {
  const forced = PROVIDERS.find((p) => p.name === process.env.LLM_PROVIDER && process.env[p.keyEnv]);
  return forced ?? PROVIDERS.find((p) => process.env[p.keyEnv]) ?? null;
}

class BackupError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function callOnce(p: Provider, model: string, opts: BackupCall, timeoutMs: number): Promise<string> {
  const res = await fetch(p.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env[p.keyEnv]}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.prompt },
      ],
      response_format: { type: "json_schema", json_schema: { name: "rfp_triage", schema: opts.jsonSchema, strict: true } },
      ...p.extraBody,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string; code?: number };
    choices?: { message?: { content?: string } }[];
  } | null;
  // OpenRouter can report upstream errors inside a 200 response.
  if (!res.ok || body?.error) {
    const status = body?.error?.code ?? res.status;
    throw new BackupError(`${p.name} ${model} ${status}: ${JSON.stringify(body?.error ?? body).slice(0, 300)}`, status);
  }
  const text = body?.choices?.[0]?.message?.content;
  if (!text) throw new BackupError(`Empty response from ${p.name} ${model}`, 502);
  return text;
}

interface BackupCall {
  system: string;
  prompt: string;
  jsonSchema: unknown;
  deadline: number;
}

export async function backupJson(opts: BackupCall): Promise<{ text: string; model: string }> {
  const p = backupProvider();
  if (!p) throw new Error("No backup provider configured");
  const chain = [...new Set([process.env[p.modelEnv], ...p.models].filter((m): m is string => Boolean(m)))];
  let lastErr: unknown = new Error(`No ${p.name} model was available in time`);
  for (const model of chain) {
    const remaining = opts.deadline - Date.now();
    if (remaining < 5000) break;
    try {
      return { text: await callOnce(p, model, opts, remaining), model: `${p.name}/${model}` };
    } catch (err) {
      lastErr = err;
      const status = (err as BackupError).status;
      // Bad key, no plan/credits (402) or bad request won't be fixed by another model.
      if (status === 401 || status === 402 || status === 403) break;
      console.warn(`[${p.name}]`, (err as Error).message.slice(0, 200));
    }
  }
  throw lastErr;
}
