/**
 * Deterministic checks on the model's output against the extracted PDF text.
 *
 * - Every {quote, page} pair is searched for in the document. Exact match on
 *   the cited page = "exact"; found on another page = "page_corrected" (and the
 *   page is fixed); most of the quote found = "fuzzy"; otherwise "unverified".
 * - Every key date is re-parsed from its as-written text and compared with the
 *   model's ISO date, so a transposed day or year is caught.
 */

export type Check = "exact" | "page_corrected" | "fuzzy" | "unverified" | "none";
export type DateCheck = "ok" | "mismatch" | "not_in_document" | "no_full_date";

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9$%]+/g, " ")
    .trim();
}

export class DocIndex {
  private readonly pages: string[];
  private readonly full: string;

  constructor(rawPages: string[]) {
    this.pages = rawPages.map(normalize);
    this.full = this.pages.join(" ");
  }

  get pageCount(): number {
    return this.pages.length;
  }

  contains(text: string): boolean {
    const n = normalize(text);
    return n.length > 0 && this.full.includes(n);
  }

  /** Returns the check result and the page the quote was actually found on. */
  locate(quote: string, page: number | null): { check: Check; page: number | null } {
    // Quotes may elide text with "..." - every fragment must be found.
    const parts = quote
      .split(/\.{3}|…/)
      .map(normalize)
      .filter((p) => p.length >= 4);
    if (parts.length === 0) return { check: "none", page };

    const cited = page !== null && page >= 1 && page <= this.pages.length ? page - 1 : -1;
    if (cited >= 0 && parts.every((p) => this.pages[cited].includes(p))) return { check: "exact", page };

    for (let i = 0; i < this.pages.length; i++) {
      if (parts.every((p) => this.pages[i].includes(p))) return { check: "page_corrected", page: i + 1 };
    }

    // Fuzzy: share of 5-word windows that appear somewhere on one page.
    const words = parts.join(" ").split(" ");
    if (words.length < 5) return { check: "unverified", page };
    const windows: string[] = [];
    for (let i = 0; i + 5 <= words.length; i++) windows.push(words.slice(i, i + 5).join(" "));
    let best = { ratio: 0, page: -1 };
    for (let i = 0; i < this.pages.length; i++) {
      const hits = windows.filter((w) => this.pages[i].includes(w)).length;
      const ratio = hits / windows.length;
      if (ratio > best.ratio) best = { ratio, page: i };
    }
    if (best.ratio >= 0.6) return { check: "fuzzy", page: best.page + 1 };
    return { check: "unverified", page };
  }
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const MONTH_DAY_YEAR = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i;
const DAY_MONTH_YEAR = /\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?,?\s+(\d{4})\b/i;
const NUMERIC = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Parses the first full calendar date in a string; returns ISO and the matched text. */
export function parseWrittenDate(text: string): { iso: string; matched: string } | null {
  let m = MONTH_DAY_YEAR.exec(text);
  if (m) return { iso: iso(+m[3], MONTHS[m[1].toLowerCase().slice(0, 3)], +m[2]), matched: m[0] };
  m = DAY_MONTH_YEAR.exec(text);
  if (m) return { iso: iso(+m[3], MONTHS[m[2].toLowerCase().slice(0, 3)], +m[1]), matched: m[0] };
  m = NUMERIC.exec(text);
  if (m) return { iso: iso(+m[3], +m[1], +m[2]), matched: m[0] }; // US order: MM/DD/YYYY
  return null;
}

export function checkDate(dateIso: string | null, asWritten: string, doc: DocIndex): DateCheck {
  const parsed = parseWrittenDate(asWritten);
  if (!parsed) return dateIso ? "mismatch" : "no_full_date";
  // e.g. "Week of February 8, 2027": the model rightly gave no single calendar date.
  if (dateIso === null) return "no_full_date";
  if (dateIso !== parsed.iso) return "mismatch";
  return doc.contains(parsed.matched) ? "ok" : "not_in_document";
}

type Verifiable = { quote: string; page: number | null };

function isVerifiable(v: unknown): v is Verifiable & Record<string, unknown> {
  return typeof v === "object" && v !== null && "quote" in v && "page" in v && typeof (v as Verifiable).quote === "string";
}

/** Walks any object tree and annotates every {quote, page} node in place. */
export function annotateQuotes(node: unknown, doc: DocIndex, tally: { total: number; verified: number }): void {
  if (Array.isArray(node)) {
    for (const item of node) annotateQuotes(item, doc, tally);
    return;
  }
  if (typeof node !== "object" || node === null) return;
  if (isVerifiable(node)) {
    const { check, page } = node.quote.trim() ? doc.locate(node.quote, node.page) : { check: "none" as Check, page: node.page };
    node.check = check;
    node.page = page;
    if (check !== "none") {
      tally.total++;
      if (check !== "unverified") tally.verified++;
    }
  }
  for (const value of Object.values(node)) {
    if (typeof value === "object") annotateQuotes(value, doc, tally);
  }
}
