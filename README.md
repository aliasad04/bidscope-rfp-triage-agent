# BidScope: RFP Triage Agent

Drop in a government RFP PDF and get a bid / no-bid decision in under a minute. Each date, requirement and fine-print trap links to the page it came from, and the agent checks those quotes against the PDF text.

**Live:** `<add your Vercel URL here>`  ·  **API:** `POST /api/analyze`

| | |
|---|---|
| **Model** | Google Gemini 3.6 Flash (free tier), with automatic fallback to other Gemini Flash models, then to a free OpenRouter model (NVIDIA Nemotron 3.5 Super) |
| **Hosting** | Vercel Hobby (free), Next.js 16 App Router, Node 24 |
| **Cost** | $0. No payment card needed for Gemini or Vercel |

---

## What it returns

For every RFP the report shows:

1. **Decision:** `BID` / `NO_BID`, the three strongest reasons, deal-breakers, and *what would change our mind*.
2. **Fit score, 0–10:** scored against the idiaz.io profile, with a one-line reason for each factor that moved it.
3. **Summary:** what the client wants, in plain English, plus scope highlights.
4. **At a glance:** contract value, type, term, place of performance, how to submit, award basis, set-asides, funding, procurement contact.
5. **Key dates:** every date as a real calendar date with a countdown. Superseded dates (e.g. changed by an addendum) are struck through.
6. **Pre-bid meeting / site visit:** mandatory or optional, when, where, how to register, what happens if you miss it.
7. **Bid security:** required or not, amount and form. Shows **"Not stated"** when the RFP is silent.
8. **Requirements & eligibility matrix:** certifications, licences, registrations, set-asides, clearances, background checks, past performance, staffing, insurance, bonds. Each is marked *We meet / Gap / Verify* against the company profile.
9. **Documents to submit:** a tickable checklist (signed, notarized, separate file, page limits).
10. **Ambiguities & open questions** to send to the agency.

The same data is available as JSON in the UI (copy or download) and from the API. The top-level fields follow the brief's output shape:

```json
{
  "decision": "BID",
  "fit_score": 8,
  "deadlines": [{ "what": "Proposals due", "date": "2027-01-15", "time": "3:00 PM Pacific", "mandatory": true, "page": 5 }],
  "requirements": [{ "category": "set_aside", "requirement": "…", "mandatory": true, "company_status": "unknown", "page": 10 }],
  "reasons": ["…", "…", "…"],
  "score_breakdown": [...], "verification": {...}, "analysis": { …full detail with quotes… }
}
```

```bash
curl -F file=@rfp.pdf https://<host>/api/analyze            # plain JSON report
curl -N -F file=@rfp.pdf "https://<host>/api/analyze?stream=1" # NDJSON progress events + report
```

## Bonus feature: the Bid Action Kit

Triage doesn't end at "bid". Next the team has to **not get disqualified on a technicality** and **hit every date**. The Bid Action Kit turns the report into those next steps.

| Part | What it does | Why it matters |
|---|---|---|
| **Disqualification-risk scanner** | Pulls out the fine print that gets proposals thrown out or makes the contract painful, ranked by severity with the source page. Examples: mandatory site walks, "emailed proposals will not be accepted", page limits, pricing that must be in a separate file, exceptions that are waived if not listed, notarized affidavits, no-contact rules, addendum acknowledgements, liquidated damages. | Most losses on public bids are self-inflicted compliance misses, not price. These traps hide in Sections 5–12 and in the forms. |
| **One-click calendar (.ics)** | Every current deadline goes into Outlook / Google Calendar with a 2-day reminder. Mandatory events are tagged, and each event holds the source quote and page. | The Q&A cut-off and site-walk registration come weeks before the proposal date and are the ones teams miss. |
| **Ready-to-send questions email** | Drafts the clarification email to the named procurement contact. The subject line references the solicitation number. It lists the open questions and every flagged ambiguity, and notes the questions deadline. Open in your email app or copy. Nothing is sent automatically. | Turns *"flag anything ambiguous"* into action before the Q&A window closes. Good questions also shape the final RFP. |
| **Triage board** | Every RFP analysed in the browser, ranked BID-first by fit score, with due dates and countdowns. | The brief's Monday scenario: three RFPs in, which one deserves the week? |

Two further features support accuracy and fit:

- **Verified citations.** Every fact the model extracts carries a verbatim quote and page number, and the server checks each one against the PDF text (*verified / close match / unverified*). Every date is also re-parsed from its as-written text and compared with the model's calendar date. The report header shows how many citations were verified, and any date mismatch is flagged on that date.
- **Editable company profile.** The idiaz.io profile from the brief is built in. Users can add facts the brief doesn't give (years in business, headcount, insurance limits, past public-sector projects) to turn *Verify* items into *We meet* or *Gap*. When the profile changes, the report can be re-scored without re-uploading.

## How it works

```
Browser                                   Server (Vercel function)                          Gemini
───────                                   ────────────────────────                          ──────
PDF ─► unpdf extracts text page by page
       (no upload-size limit)  ──JSON──►  validate (scanned PDF? size?)
                                          ├─► quick screen (first ~12k chars) ───────────►  flash-lite
                                          │     ◄── "janitorial: outside" in ~2–4 s ─────  (streamed to UI)
                                          └─► full read with [PAGE n] markers ───────────►  flash, JSON schema
                                                ◄── structured analysis ─────────────────
                                          zod validation
                                          verify quotes + dates against page text
                                          deterministic score + decision policy
               ◄── NDJSON stream ───────  report
```

**Key design decisions**

- **The model rates, the code scores.** The model doesn't output a number out of 10. It classifies domain alignment (core / adjacent / outside) and rates four factors from −2 to +2. `src/lib/score.ts` converts those to points: domain 5, then eligibility, delivery, commercial and risk at 1.25 each. That makes the score repeatable and explainable line by line. The **decision policy** is code too:
  - Work outside the domain → **fast no-bid**, score capped at 2.
  - Any mandatory requirement the profile can't meet → no-bid.
  - Otherwise BID at 6 or more.
  - If the model's suggestion disagrees with the policy, the report says so.
- **One schema, two uses.** The Zod schema in `src/lib/schema.ts` generates the JSON Schema sent to Gemini's structured output *and* validates the response, so the prompt contract and the code can't drift apart. Field descriptions in the schema are part of the prompt.
- **Grounding rules in the prompt:** use only the document; write "Not stated" when it's missing; flag ambiguity instead of choosing; list superseded dates separately; treat the RFP text as untrusted data (prompt-injection defence).
- **Text in the browser, not the server.** Vercel caps request bodies at ~4.5 MB. Extracting text client-side means a 100-page RFP sends only ~300 KB of text. If in-browser extraction fails, the UI falls back to uploading the PDF for server-side extraction.
- **Model fallback chain.** Free-tier model names and quotas change: by Nov 2026 the 2.5 models were closed to new keys and the newest Flash models were often overloaded. `src/lib/gemini.ts` tries `GEMINI_MODEL` → `gemini-3.6-flash` → `gemini-3.5-flash` → `gemini-3.8-flash` → `gemini-3.7-flash`, moving on for 404 / 429 / 5xx. If all of them fail, it asks the API which Flash models the key can see and tries those. Identical re-uploads are served from an in-memory cache, so demos don't burn quota.
- **Backup provider: OpenRouter free models.** When every Gemini model fails (overloaded, free quota used up), the full analysis is retried on OpenRouter's free `nvidia/nemotron-3.5-super-vl:free` (1M-token context, then `ling-3.2-flash:free`, then `openrouter/free`). It uses the same JSON Schema, validation and quote verification (`src/lib/llm.ts`, `src/lib/backup.ts`). Reasoning is switched off for it: with reasoning on, a 12-page RFP took ~110 s; off, ~45 s.
  - **Measured trade-off:** on the eval, the backup got both decisions right (janitorial NO BID 0/10, all checks passed; Port Alder BID 8/10). On Port Alder it missed some date categories, the addendum change and the "Not stated" bid security. Reports made by the backup therefore show an amber "backup model" warning. It keeps the demo working; it doesn't replace Gemini.
  - Mistral is supported by the same client but needs a paid plan as of Nov 2026, so it is off. Test the backup alone with `LLM_PROVIDER=openrouter`.
- **Low thinking level by default.** On the sample RFPs, `thinkingLevel: LOW` cut analysis time from ~60 s to ~30 s and passed the same accuracy checks. Configurable with `GEMINI_THINKING_LEVEL`.
- **Streaming progress.** The UI shows each step and the quick-screen verdict while the full read runs. A janitorial RFP shows *outside our domain* within a few seconds.

**Why Gemini Flash:** a long context window (a 100-page RFP fits in one call, so nothing is lost to chunking), native JSON-schema structured output, speed (well under a minute for the samples), and a free tier with no card. Groq was considered for speed, but its free-tier tokens-per-minute limit is too small for long RFPs.

**Why Vercel:** a free, always-on live link with no cold-start sleep (Render's free tier sleeps and takes ~50 s to wake, which would break "report in about a minute"). It has first-class Next.js support and secrets kept in environment variables.

## Run it locally

Requires Node 24+.

```bash
npm install
cp .env.example .env.local        # then paste a free key from https://aistudio.google.com/apikey
npm run dev                       # http://localhost:3000
```

### Check accuracy against the samples

```bash
npm run eval            # offline: text extraction, date parser, quote verifier
npm run eval -- --live  # full agent on both sample RFPs vs. hand-checked answers
```

The live eval checks the expected decision, score range, every key date (including the Port Alder proposal date that Addendum No. 1 moved from Jan 8 to **Jan 15, 2027**), pre-bid status, bid security, must-mention requirements, date consistency and the citation-verification rate.

## Deploy (free)

1. Push this folder to a GitHub repo, then on vercel.com choose **Add New → Project** and import it. Or run `npx vercel` from this folder.
2. Add the environment variable `GEMINI_API_KEY`, then deploy.

## Project layout

```
src/app/page.tsx              upload, progress stream, triage board
src/app/api/analyze/route.ts  API: JSON or multipart in, JSON or NDJSON out
src/components/ReportView.tsx the report
src/lib/schema.ts             zod schema → Gemini JSON Schema + validation
src/lib/prompt.ts             system prompt and grounding rules
src/lib/gemini.ts             Gemini model fallback chain
src/lib/backup.ts             OpenRouter / Mistral backup client
src/lib/llm.ts                provider routing: Gemini first, backup second
src/lib/analyze.ts            pipeline: screen → analyse → verify → score
src/lib/verify.ts             quote and date verification
src/lib/score.ts              deterministic fit score + decision policy
src/lib/actions.ts            .ics calendar, questions email, countdowns
scripts/eval.ts               accuracy checks on the sample RFPs
```

## Limitations

- **Text-based PDFs only.** Scanned PDFs are detected and rejected with a clear message (no OCR).
- **Strikethrough can't be seen in extracted text.** A struck-out date appears next to its replacement. The prompt tells the model to resolve this from addendum text and to flag it as ambiguous if unresolved.
- **The free tier has rate limits.** Many uploads in a short burst can briefly hit them; the app falls back across models and shows a friendly message.
- **Fit judgements are only as good as the profile.** Anything the profile doesn't cover is marked *Verify*, never assumed.
