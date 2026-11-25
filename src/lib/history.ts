import type { Report } from "./report";

/**
 * Saved reports for the triage board. Lives in the viewer's browser only (no
 * accounts or database, which the brief puts out of scope). Every access is
 * guarded because storage can be unavailable in private windows.
 */

const KEY = "bidscope:history:v1";
const PROFILE_KEY = "bidscope:profile:v1";
const LIMIT = 25;

export interface SavedReport {
  id: string;
  savedAt: string;
  report: Report;
}

export function loadHistory(): SavedReport[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedReport[]) : [];
  } catch {
    return [];
  }
}

export function saveToHistory(report: Report): SavedReport[] {
  const id = `${report.analysis.solicitation_number}|${report.file_name}`;
  const next = [{ id, savedAt: new Date().toISOString(), report }, ...loadHistory().filter((h) => h.id !== id)].slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Quota or privacy mode: the board just won't persist.
  }
  return next;
}

export function removeFromHistory(id: string): SavedReport[] {
  const next = loadHistory().filter((h) => h.id !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export function loadProfile(): string | null {
  try {
    return localStorage.getItem(PROFILE_KEY);
  } catch {
    return null;
  }
}

export function saveProfile(profile: string | null) {
  try {
    if (profile === null) localStorage.removeItem(PROFILE_KEY);
    else localStorage.setItem(PROFILE_KEY, profile);
  } catch {}
}
