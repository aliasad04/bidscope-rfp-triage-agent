import type { Analysis } from "./schema";

/**
 * The model rates; the code scores. Turning the model's ratings into a number
 * here (instead of asking for "a score out of 10") makes the score repeatable,
 * explainable line by line, and impossible to drift from the decision rules.
 */

export interface ScoreLine {
  factor: string;
  points: number;
  max: number;
  reason: string;
}

export interface ScoreResult {
  fit_score: number;
  breakdown: ScoreLine[];
  decision: "BID" | "NO_BID";
  fast_no_bid: boolean;
  policy_notes: string[];
}

const DOMAIN_POINTS = { core: 5, adjacent: 3, outside: 0 } as const;
const FACTOR_MAX = 1.25;
const BID_THRESHOLD = 6;
const OUTSIDE_CAP = 2;

const FACTOR_LABELS: Record<string, string> = {
  eligibility: "Eligibility",
  delivery: "Delivery feasibility",
  commercial: "Commercial value",
  risk: "Contract risk",
};

export function scoreAnalysis(a: Analysis): ScoreResult {
  const breakdown: ScoreLine[] = [
    {
      factor: "Domain match",
      points: DOMAIN_POINTS[a.fit.domain_alignment],
      max: 5,
      reason: a.fit.domain_reason,
    },
  ];

  for (const key of ["eligibility", "delivery", "commercial", "risk"] as const) {
    const f = a.fit.factors.find((x) => x.key === key);
    const rating = Math.max(-2, Math.min(2, f?.rating ?? 0));
    breakdown.push({
      factor: FACTOR_LABELS[key],
      points: Math.round(((rating + 2) / 4) * FACTOR_MAX * 100) / 100,
      max: FACTOR_MAX,
      reason: f?.reason ?? "Not assessed by the model; treated as neutral.",
    });
  }

  const raw = breakdown.reduce((sum, l) => sum + l.points, 0);
  const outside = a.fit.domain_alignment === "outside";
  const fit_score = Math.round(outside ? Math.min(raw, OUTSIDE_CAP) : raw);

  const policy_notes: string[] = [];
  const mandatoryGaps = a.requirements.filter((r) => r.mandatory && r.company_status === "gap");

  let decision: "BID" | "NO_BID";
  if (outside) {
    decision = "NO_BID";
    policy_notes.push(`Fast no-bid: the work (${a.work_category}) is outside the company's domain, so the score is capped at ${OUTSIDE_CAP}.`);
  } else if (mandatoryGaps.length > 0) {
    decision = "NO_BID";
    policy_notes.push(`No-bid: ${mandatoryGaps.length} mandatory requirement(s) the company profile cannot meet.`);
  } else {
    decision = fit_score >= BID_THRESHOLD ? "BID" : "NO_BID";
  }

  if (decision !== a.recommendation.decision) {
    policy_notes.push(
      `The model suggested ${a.recommendation.decision}, but the decision policy (score ${fit_score}/10, threshold ${BID_THRESHOLD}) gives ${decision}. The policy decision is shown.`,
    );
  }

  return { fit_score, breakdown, decision, fast_no_bid: outside, policy_notes };
}
