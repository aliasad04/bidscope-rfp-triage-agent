import { z } from "zod";

/**
 * The shape the model must return. Every extracted fact carries a verbatim
 * quote and a page number so the server can check it against the PDF text
 * (see verify.ts). The JSON Schema sent to Gemini is generated from this, so
 * the prompt contract and the runtime validation can never drift apart.
 */

const NOT_STATED = 'exactly "Not stated" if the document does not say';

const quote = z
  .string()
  .describe(
    "Short verbatim quote (max ~30 words) copied character-for-character from the document text that supports this item. Empty string if not stated.",
  );
const page = z
  .number()
  .int()
  .nullable()
  .describe("Page number taken from the [PAGE n] marker where the quote appears; null if not stated.");

const fact = z.object({
  value: z.string().describe(`Plain-English answer, or ${NOT_STATED}.`),
  quote,
  page,
});

export const DATE_CATEGORIES = [
  "proposal_due",
  "questions_due",
  "pre_bid_meeting",
  "site_visit",
  "registration",
  "answers_posted",
  "award",
  "contract_start",
  "issue_date",
  "other",
] as const;

export const REQUIREMENT_CATEGORIES = [
  "set_aside",
  "certification",
  "license_registration",
  "security_clearance",
  "background_check",
  "past_performance",
  "experience",
  "staffing",
  "on_site_presence",
  "insurance",
  "bonding",
  "technical",
  "security_compliance",
  "labor_wage",
  "other",
] as const;

export const AnalysisSchema = z.object({
  title: z.string().describe("Solicitation title."),
  solicitation_number: z.string().describe(`RFP / solicitation number, or ${NOT_STATED}.`),
  agency: z.string().describe("Issuing agency and department."),
  procurement_contact: z.object({
    name: z.string().describe(`Contact person or office, or ${NOT_STATED}.`),
    email: z.string().describe(`Email, or ${NOT_STATED}.`),
    phone: z.string().describe(`Phone, or ${NOT_STATED}.`),
  }),
  summary: z
    .string()
    .describe("3-5 plain-English sentences: what the client wants bought, for whom, and the main outcome. No jargon."),
  scope_highlights: z.array(z.string()).describe("3-7 short bullets describing the actual work to be delivered."),
  work_category: z
    .string()
    .describe('Short label for the kind of work, e.g. "AI workflow software platform", "Janitorial services", "Road construction".'),

  facts: z.object({
    contract_type: fact.describe("e.g. fixed price, subscription, time-and-materials, IDIQ."),
    contract_value: fact.describe("Budget, not-to-exceed amount or estimated value."),
    contract_term: fact.describe("Base term and renewal options."),
    place_of_performance: fact.describe("Where the work happens, including any on-site requirement."),
    submission_method: fact.describe("How and where to submit (portal, sealed hard copy, email), copies and format."),
    award_basis: fact.describe("How the winner is chosen (best value, lowest responsive bidder, points)."),
    set_aside: fact.describe("Small business / MBE / WBE / veteran / 8(a) / local preference set-asides or goals."),
    funding_source: fact.describe("Funding source (federal funds trigger extra clauses)."),
  }),

  bid_security: z.object({
    required: z
      .enum(["yes", "no", "not_stated"])
      .describe(
        "Is a bid bond / bid guaranty / proposal security required with the proposal? 'no' ONLY if the document explicitly says none is required; if the document is silent, 'not_stated'. Performance bonds and insurance are not bid security.",
      ),
    details: z.string().describe(`Amount and acceptable form, or ${NOT_STATED}.`),
    quote,
    page,
  }),

  pre_bid_meeting: z.object({
    status: z.enum(["mandatory", "optional", "not_stated"]),
    when: z.string().describe(`Date and time as written, or ${NOT_STATED}.`),
    where: z.string().describe(`Location or format (in person / Teams), or ${NOT_STATED}.`),
    registration: z.string().describe(`How/by when to register, or ${NOT_STATED}.`),
    consequence_if_missed: z.string().describe(`What happens if a firm does not attend, or ${NOT_STATED}.`),
    quote,
    page,
  }),

  key_dates: z
    .array(
      z.object({
        event: z.string(),
        category: z.enum(DATE_CATEGORIES),
        date_iso: z
          .string()
          .nullable()
          .describe("Calendar date as YYYY-MM-DD, only if the document gives a full date. null for relative dates like '120 days after NTP'."),
        time: z.string().describe('Time and timezone as written, e.g. "3:00 PM Pacific"; empty string if none.'),
        as_written: z.string().describe("The date exactly as written in the document (single date, not a range of revisions)."),
        status: z
          .enum(["current", "superseded", "tentative"])
          .describe("superseded = replaced by an addendum/revision; tentative = 'anticipated' or 'estimated'."),
        mandatory: z.boolean().describe("True if missing this date/event disqualifies the bidder."),
        note: z.string().describe("Anything the bids lead must know, e.g. 'Extended by Addendum No. 1'. Empty if nothing."),
        quote,
        page,
      }),
    )
    .describe(
      "EVERY date in the document that matters to a bidder: issue, pre-bid/site visit, registration cut-offs, questions, answers, proposal due, demos, award, contract start. Include superseded dates as separate entries with status 'superseded'.",
    ),

  requirements: z
    .array(
      z.object({
        category: z.enum(REQUIREMENT_CATEGORIES),
        requirement: z.string().describe("The requirement in one short sentence."),
        mandatory: z.boolean().describe("True for shall/must/minimum qualification; false for desired/preferred/scored."),
        company_status: z
          .enum(["meets", "gap", "unknown", "not_applicable"])
          .describe(
            "Judged ONLY against the company profile: meets = profile shows it is met; gap = profile shows it cannot be met before the deadline; unknown = profile is silent (the team must verify).",
          ),
        company_note: z.string().describe("One line explaining the company_status."),
        quote,
        page,
      }),
    )
    .describe(
      "Every eligibility and must-have requirement: minimum qualifications, set-asides, certifications, licenses/registrations, clearances, background checks, past performance, staffing, on-site presence, insurance, bonding, wage rules. ALSO every item marked mandatory ([M], shall, must) in technical, security, hosting or accessibility sections - e.g. accessibility standards (WCAG/Section 508), data residency, SOC 2/FedRAMP/ISO, encryption, SSO/MFA, uptime SLAs. One entry per distinct requirement. Do not invent any; do not skip any.",
    ),

  documents_to_submit: z
    .array(
      z.object({
        name: z.string().describe("Form, tab or document name."),
        details: z.string().describe("Signed / notarized / separate file / page limit etc. Empty if nothing special."),
        quote,
        page,
      }),
    )
    .describe("Checklist of everything that must be in the submission package."),

  bonds_and_insurance: z
    .array(
      z.object({
        type: z.string(),
        amount: z.string(),
        when_due: z.string().describe(`e.g. "with proposal", "before contract execution", or ${NOT_STATED}.`),
        quote,
        page,
      }),
    )
    .describe("Each bond and insurance coverage required."),

  disqualification_risks: z
    .array(
      z.object({
        title: z.string().describe("Short name of the trap, e.g. 'Mandatory site walk'."),
        consequence: z.string().describe("What happens if missed, in the document's terms."),
        severity: z.enum(["high", "medium", "low"]).describe("high = automatic rejection; medium = scoring loss or contract risk; low = nuisance."),
        quote,
        page,
      }),
    )
    .describe(
      "Fine-print traps that can get a proposal rejected or hurt the bidder: mandatory attendance, format/page limits, delivery method, addendum acknowledgement, no-contact rules, notarization, pricing placement, waived exceptions, liquidated damages, uncapped liability, withdrawal lock periods.",
    ),

  bid_effort: z
    .object({
      level: z.enum(["low", "medium", "high"]).describe("How much work it takes to PREPARE and SUBMIT this bid (not to deliver the contract)."),
      summary: z.string().describe("One line explaining the level."),
      drivers: z
        .array(
          z.object({
            driver: z.string().describe('Short label, e.g. "30-page technical volume", "Notarized affidavit", "Mandatory site walk", "Finalist demo".'),
            detail: z.string().describe("What it involves, in the document's terms."),
            quote,
            page,
          }),
        )
        .describe(
          "Document facts that drive the cost of bidding: page limits and number of volumes/tabs, number of forms, signatures/notarization, hard-copy or in-person delivery, mandatory meetings, site walks or travel, demos/orals, bid bond cost, and time left until the deadline. Never estimate hours or dollars.",
        ),
    })
    .describe("Cost-to-bid estimate grounded only in the document."),

  ambiguities: z
    .array(
      z.object({
        issue: z.string(),
        possible_readings: z.array(z.string()).describe("The different ways it could be read."),
        quote,
        page,
      }),
    )
    .describe("Anything unclear or contradictory. Flag it; never silently pick one reading."),

  open_questions: z
    .array(z.string())
    .describe("Specific clarification questions worth sending to the agency before the questions deadline."),

  fit: z.object({
    domain_alignment: z
      .enum(["core", "adjacent", "outside"])
      .describe("core = squarely what the company builds; adjacent = partly; outside = not the company's kind of work at all."),
    domain_reason: z.string().describe("One line: why this alignment."),
    matched_capabilities: z.array(z.string()).describe("Which company capabilities this work uses (empty if none)."),
    factors: z
      .array(
        z.object({
          key: z.enum(["eligibility", "delivery", "commercial", "risk"]),
          rating: z.number().int().min(-2).max(2).describe("-2 very unfavourable … 0 neutral … +2 very favourable."),
          reason: z.string().describe("One line citing the specific fact that moved this rating."),
        }),
      )
      .describe(
        "Exactly four entries, one per key. eligibility = can the company qualify (set-asides, minimum quals, certifications); delivery = can a small senior remote team deliver the scope and timeline (on-site needs, staffing); commercial = value, budget and payment terms vs effort; risk = liability, penalties, UAT, SLAs, bonding.",
      ),
  }),

  recommendation: z.object({
    decision: z.enum(["BID", "NO_BID"]),
    reasons: z.array(z.string()).describe("The three strongest reasons for the decision, most important first."),
    deal_breakers: z.array(z.string()).describe("Items that would stop the bid outright. Empty if none."),
    what_would_change_mind: z.array(z.string()).describe("Concrete facts that would flip the decision."),
  }),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

export const ScreenSchema = z.object({
  work_category: z.string().describe("Short label for the kind of work being procured."),
  domain_alignment: z.enum(["core", "adjacent", "outside"]),
  reason: z.string().describe("One sentence."),
});

export type Screen = z.infer<typeof ScreenSchema>;

/**
 * Gemini accepts a JSON Schema subset. Drop the meta keyword and the ±2^53
 * bounds zod adds to every .int(), which only bloat the decoding constraints.
 */
export function toGeminiJsonSchema(schema: z.ZodType): unknown {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  const strip = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(strip);
    if (typeof node !== "object" || node === null) return;
    const obj = node as Record<string, unknown>;
    for (const k of ["minimum", "maximum"]) {
      if (typeof obj[k] === "number" && Math.abs(obj[k] as number) > 1e12) delete obj[k];
    }
    Object.values(obj).forEach(strip);
  };
  strip(json);
  return json;
}
