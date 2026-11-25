import { backupJson, backupProvider } from "./backup";
import { geminiJson, type JsonCallOptions, type JsonCallResult } from "./gemini";

/**
 * Provider routing. Gemini is primary (long context, free). If a backup key is
 * set (OpenRouter, or Mistral), the full analysis falls back to it whenever
 * Gemini fails for any reason, with time held back so the backup can still
 * finish. The quick screen stays Gemini-only: it is optional and would eat the
 * backup's small free request allowance.
 * LLM_PROVIDER=openrouter|mistral skips Gemini entirely (handy for testing).
 */

// The free backup model needs ~45-60s for a full RFP; keep enough time for it plus one retry.
const BACKUP_RESERVE_MS = 120_000;

export async function generateJson(opts: JsonCallOptions): Promise<JsonCallResult> {
  const backup = opts.kind === "analysis" ? backupProvider() : null;
  const deadline = Date.now() + opts.timeoutMs;
  const runBackup = () => backupJson({ system: opts.system, prompt: opts.prompt, jsonSchema: opts.jsonSchema, deadline });

  if (backup && (process.env.LLM_PROVIDER === backup.name || !process.env.GEMINI_API_KEY)) return runBackup();

  try {
    return await geminiJson({ ...opts, timeoutMs: backup ? opts.timeoutMs - BACKUP_RESERVE_MS : opts.timeoutMs });
  } catch (geminiErr) {
    if (!backup) throw geminiErr;
    console.warn(`[llm] Gemini failed, falling back to ${backup.name}:`, String((geminiErr as Error)?.message ?? geminiErr).slice(0, 200));
    try {
      return await runBackup();
    } catch (backupErr) {
      throw new Error(`${(geminiErr as Error)?.message ?? geminiErr} | Backup (${backup.name}) also failed: ${(backupErr as Error)?.message ?? backupErr}`);
    }
  }
}
