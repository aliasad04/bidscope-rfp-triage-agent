/**
 * Accuracy check against the two sample RFPs.
 *
 *   npm run eval            offline checks only (text extraction, date parser, quote verifier)
 *   npm run eval -- --live  also runs the full agent (needs GEMINI_API_KEY) and
 *                           compares the report with answers checked by hand
 *
 * Ground truth below was written by reading each PDF manually.
 */
import { readFile } from "node:fs/promises";
import { analyzeRfp } from "../src/lib/analyze";
import { extractPages } from "../src/lib/pdf-text";
import { DocIndex, parseWrittenDate } from "../src/lib/verify";

interface Expected {
  file: string;
  decision: "BID" | "NO_BID";
  fastNoBid: boolean;
  scoreRange: [number, number];
  currentDates: Record<string, string>; // category -> ISO date
  supersededDates: string[];
  preBid: "mandatory" | "optional";
  bidSecurity: "yes" | "no" | "not_stated";
  mustMentionRequirements: RegExp[];
  knownQuotes: [string, number][];
}

const CASES: Expected[] = [
  {
    file: "public/samples/Sample-RFP-1-Port-Alder-Permit-Automation.pdf",
    decision: "BID",
    fastNoBid: false,
    scoreRange: [6, 10],
    currentDates: {
      proposal_due: "2027-01-15",
      questions_due: "2026-12-11",
      pre_bid_meeting: "2026-12-03",
      contract_start: "2027-03-22",
    },
    supersededDates: ["2027-01-08"],
    preBid: "optional",
    bidSecurity: "not_stated",
    mustMentionRequirements: [/small business/i, /three|3\)? years/i, /washington|UBI/i, /in person|kickoff/i, /SOC 2|FedRAMP/i, /WCAG/i],
    knownQuotes: [
      ["The proposal due date is extended from January 8, 2027 to January 15, 2027", 5],
      ["Proposals over the $420,000 not-to-exceed amount will be rejected", 11],
    ],
  },
  {
    file: "public/samples/Sample-RFP-2-Larkspur-County-Janitorial.pdf",
    decision: "NO_BID",
    fastNoBid: true,
    scoreRange: [0, 2],
    currentDates: {
      proposal_due: "2026-12-15",
      questions_due: "2026-12-07",
      pre_bid_meeting: "2026-12-03",
      contract_start: "2027-02-01",
    },
    supersededDates: [],
    preBid: "mandatory",
    bidSecurity: "yes",
    mustMentionRequirements: [/five|5\)? years/i, /background|BCI|fingerprint/i, /living wage|17\.25/i, /30 miles|local supervisor/i, /bond/i],
    knownQuotes: [
      ["Proposals from firms that did not sign in at the site walk will be rejected as non-responsive", 3],
      ["a bid bond or certified check for 10% of the first-year bid price", 7],
    ],
  },
];

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const live = process.argv.includes("--live");

  console.log("Date parser");
  check(parseWrittenDate("January 15, 2027, 3:00 PM Pacific")?.iso === "2027-01-15", "Month D, YYYY");
  check(parseWrittenDate("Tuesday, December 15, 2026")?.iso === "2026-12-15", "weekday prefix");
  check(parseWrittenDate("Sept. 3, 2026")?.iso === "2026-09-03", "abbreviated month");
  check(parseWrittenDate("3 December 2026")?.iso === "2026-12-03", "D Month YYYY");
  check(parseWrittenDate("12/07/2026")?.iso === "2026-12-07", "MM/DD/YYYY");
  check(parseWrittenDate("Within 120 days of NTP") === null, "relative date is not a calendar date");

  for (const [i, c] of CASES.entries()) {
    // The free Gemini tier allows only a few requests per minute; space the live runs out.
    if (live && i > 0) {
      console.log("\n(waiting 65s for the free-tier per-minute quota)");
      await new Promise((r) => setTimeout(r, 65_000));
    }
    console.log(`\n${c.file}`);
    const pages = await extractPages(new Uint8Array(await readFile(c.file)));
    check(pages.length > 10, "text extracted", `${pages.length} pages, ${pages.join("").length} chars`);
    const doc = new DocIndex(pages);
    for (const [q, p] of c.knownQuotes) check(doc.locate(q, p).check === "exact", `quote found on p.${p}`, q.slice(0, 50));
    check(doc.locate("The contractor must hold a FedRAMP High authorization", 2).check === "unverified", "invented quote is rejected");

    if (!live) continue;
    const r = await analyzeRfp({ fileName: c.file, pages });
    const a = r.analysis;
    console.log(`  model ${r.model}, ${(r.elapsed_ms / 1000).toFixed(1)}s, score ${r.fit_score}, ${r.decision}`);
    check(r.decision === c.decision, "decision", r.decision);
    check(r.fast_no_bid === c.fastNoBid, "fast no-bid flag");
    check(r.fit_score >= c.scoreRange[0] && r.fit_score <= c.scoreRange[1], "score in range", `${r.fit_score}`);
    for (const [cat, date] of Object.entries(c.currentDates)) {
      const hit = a.key_dates.find((d) => d.category === cat && d.status !== "superseded" && d.date_iso === date);
      check(Boolean(hit), `${cat} = ${date}`, a.key_dates.filter((d) => d.category === cat).map((d) => `${d.date_iso}/${d.status}`).join(", "));
    }
    for (const date of c.supersededDates) {
      check(a.key_dates.some((d) => d.date_iso === date && d.status === "superseded"), `${date} marked superseded`);
    }
    check(a.pre_bid_meeting.status === c.preBid, "pre-bid meeting status", a.pre_bid_meeting.status);
    check(a.bid_security.required === c.bidSecurity, "bid security", a.bid_security.required);
    // Bonds may be reported in the bonds/insurance list rather than as requirements; both count.
    const reqText = [...a.requirements.map((x) => x.requirement), ...a.bonds_and_insurance.map((b) => `${b.type} ${b.amount}`)].join(" | ");
    for (const re of c.mustMentionRequirements) check(re.test(reqText), `requirement ${re}`);
    check(a.key_dates.every((d) => d.date_check !== "mismatch"), "no date mismatches");
    check(r.verification.quotes_verified / Math.max(1, r.verification.quotes_checked) >= 0.9, "quotes verified ≥ 90%", `${r.verification.quotes_verified}/${r.verification.quotes_checked}`);
    check(r.reasons.length === 3, "exactly three reasons");
  }

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
