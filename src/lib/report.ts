import type { Analysis } from "./schema";
import type { ScoreLine } from "./score";
import type { Check, DateCheck } from "./verify";

/** Adds a `check` field to every object that carries a quote. */
type Verified<T> = T extends (infer U)[]
  ? Verified<U>[]
  : T extends object
    ? { [K in keyof T]: Verified<T[K]> } & (T extends { quote: string } ? { check?: Check } : unknown)
    : T;

type VerifiedAnalysis = Omit<Verified<Analysis>, "key_dates"> & {
  key_dates: (Verified<Analysis["key_dates"][number]> & { date_check?: DateCheck })[];
};

export interface Report {
  schema_version: string;
  decision: "BID" | "NO_BID";
  fit_score: number;
  deadlines: { what: string; date: string; time: string; mandatory: boolean; page: number | null }[];
  requirements: {
    category: string;
    requirement: string;
    mandatory: boolean;
    company_status: string;
    page: number | null;
  }[];
  reasons: string[];
  bid_effort: { level: "low" | "medium" | "high"; summary: string };
  fast_no_bid: boolean;
  score_breakdown: ScoreLine[];
  policy_notes: string[];
  verification: { quotes_checked: number; quotes_verified: number; date_issues: number };
  file_name: string;
  page_count: number;
  model: string;
  elapsed_ms: number;
  generated_at: string;
  profile_used: string;
  cached: boolean;
  analysis: VerifiedAnalysis;
}

export type { Check, DateCheck };
