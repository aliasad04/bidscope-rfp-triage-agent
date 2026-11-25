"use client";

import { useEffect, useMemo, useState } from "react";
import { buildIcs, buildQuestionsEmail, countdownLabel, daysUntil, download, proposalDue, slug } from "@/lib/actions";
import type { Report } from "@/lib/report";
import { Badge, Button, Card, Cite, Icon, IconTile, SectionTitle, Value, cx, formatDate, isNotStated, type Accent, type IconName, type Tone } from "./ui";

type A = Report["analysis"];

const NAV: [string, string, IconName][] = [
  ["decision", "Decision", "target"],
  ["effort", "Cost to bid", "gauge"],
  ["glance", "At a glance", "building"],
  ["dates", "Key dates", "calendar"],
  ["requirements", "Requirements", "shield"],
  ["submission", "Submission", "file"],
  ["risks", "Risks & traps", "alert"],
  ["questions", "Questions", "mail"],
  ["json", "JSON", "code"],
];
const NAV_IDS = NAV.map(([id]) => id);

export function ReportView({ report }: { report: Report }) {
  const a = report.analysis;
  const ref = isNotStated(a.solicitation_number) ? a.title : a.solicitation_number;
  const active = useScrollSpy(NAV_IDS);

  return (
    <div className="grid gap-8 lg:grid-cols-[190px_1fr]">
      <nav className="no-print sticky top-24 hidden self-start lg:block">
        <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Report</p>
        <ul className="space-y-0.5 text-sm">
          {NAV.map(([id, label, icon]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className={cx(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 transition",
                  active === id ? "bg-indigo-500/15 text-white ring-1 ring-inset ring-indigo-400/30" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200",
                )}
              >
                <Icon name={icon} size={15} className={active === id ? "text-indigo-300" : ""} />
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 space-y-6">
        <VerdictCard report={report} />
        <div className="grid gap-6 xl:grid-cols-2">
          <WhyCard report={report} />
          <ScoreCard report={report} />
        </div>
        <EffortCard a={a} />
        <GlanceCard a={a} />
        <DatesCard a={a} />
        <RequirementsCard a={a} />
        <SubmissionCard a={a} />
        <RisksCard a={a} />
        <QuestionsCard report={report} refLabel={ref} />
        <JsonCard report={report} />
      </div>
    </div>
  );
}

function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

/* ---------------------------------- Verdict ---------------------------------- */

const EFFORT: Record<string, { label: string; tone: Tone; accent: Accent; bars: number }> = {
  low: { label: "Low effort", tone: "green", accent: "emerald", bars: 1 },
  medium: { label: "Medium effort", tone: "amber", accent: "amber", bars: 2 },
  high: { label: "High effort", tone: "red", accent: "rose", bars: 3 },
};

function VerdictCard({ report }: { report: Report }) {
  const a = report.analysis;
  const bid = report.decision === "BID";
  const due = proposalDue(report);
  const dueDays = due?.date_iso ? daysUntil(due.date_iso) : null;
  const v = report.verification;
  const ref = isNotStated(a.solicitation_number) ? slug(a.title) : a.solicitation_number;
  const effort = a.bid_effort ? EFFORT[a.bid_effort.level] : null;
  const allVerified = v.quotes_verified === v.quotes_checked;
  const backupModel = !report.model.startsWith("gemini");

  return (
    <section
      id="decision"
      className={cx(
        "animate-fade-up print-break relative scroll-mt-24 overflow-hidden rounded-3xl border bg-slate-900/60 shadow-2xl shadow-black/30",
        bid ? "border-emerald-400/20" : "border-rose-400/20",
      )}
    >
      <div
        className={cx(
          "pointer-events-none absolute inset-0 opacity-90",
          bid
            ? "bg-[radial-gradient(700px_260px_at_0%_0%,rgba(16,185,129,0.22),transparent_70%)]"
            : "bg-[radial-gradient(700px_260px_at_0%_0%,rgba(244,63,94,0.22),transparent_70%)]",
        )}
      />
      <div className="relative flex flex-col gap-6 p-6 sm:p-8 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cx(
                "inline-flex items-center gap-2 rounded-xl px-4 py-1.5 text-lg font-bold tracking-wider text-white shadow-lg",
                bid ? "bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-500/30" : "bg-gradient-to-r from-rose-500 to-pink-600 shadow-rose-500/30",
              )}
            >
              <Icon name={bid ? "check" : "x"} size={18} />
              {bid ? "BID" : "NO BID"}
            </span>
            {report.fast_no_bid && (
              <Badge tone="red">
                <Icon name="sparkles" size={11} /> Fast no-bid · outside our domain
              </Badge>
            )}
            <Badge tone="violet">{a.work_category}</Badge>
          </div>
          <h1 className="mt-4 text-2xl font-semibold leading-tight tracking-tight text-white sm:text-[28px]">{a.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-slate-400">
            <Icon name="building" size={14} />
            {a.agency}
            {!isNotStated(a.solicitation_number) && (
              <>
                <span className="text-slate-600">•</span>
                <span className="font-mono text-slate-300">{a.solicitation_number}</span>
              </>
            )}
          </p>
          {report.reasons[0] && <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-300">{report.reasons[0]}</p>}
        </div>
        <ScoreRing score={report.fit_score} bid={bid} />
      </div>

      {backupModel && (
        <div className="relative mx-6 mb-5 flex gap-2.5 rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 sm:mx-8">
          <Icon name="alert" size={16} className="mt-0.5 text-amber-300" />
          <span>
            Made by the <span className="font-semibold">backup model</span> ({report.model}) because Gemini was busy or over its free quota. The decision is
            usually right, but check dates and requirements against the cited pages, or re-run later for a Gemini report.
          </span>
        </div>
      )}

      <div className="relative grid gap-px border-t border-white/[0.06] bg-white/[0.04] sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon="clock" accent={dueDays !== null && dueDays <= 14 ? "amber" : "indigo"} label="Proposal due">
          {due ? (
            <>
              <div className="font-semibold text-white">{formatDate(due.date_iso, due.as_written)}</div>
              <div className="text-xs text-slate-400">{due.time}</div>
              {dueDays !== null && (
                <div className={cx("mt-1 text-xs font-medium", dueDays < 0 ? "text-rose-400" : dueDays <= 14 ? "text-amber-300" : "text-emerald-300")}>
                  {dueDays < 0 ? "Deadline has passed" : countdownLabel(dueDays)}
                </div>
              )}
            </>
          ) : (
            <Value>Not stated</Value>
          )}
        </Stat>
        <Stat icon="users" accent={a.pre_bid_meeting.status === "mandatory" ? "rose" : "cyan"} label="Pre-bid meeting">
          <PreBidBadge status={a.pre_bid_meeting.status} />
          {a.pre_bid_meeting.status !== "not_stated" && <div className="mt-1 text-xs text-slate-400">{a.pre_bid_meeting.when}</div>}
        </Stat>
        <Stat icon="dollar" accent={a.bid_security.required === "yes" ? "amber" : "violet"} label="Bid security">
          <Badge tone={a.bid_security.required === "yes" ? "amber" : "slate"}>
            {a.bid_security.required === "yes" ? "Required" : a.bid_security.required === "no" ? "Not required" : "Not stated"}
          </Badge>
          {a.bid_security.required === "yes" && <div className="mt-1 text-xs text-slate-400">{a.bid_security.details}</div>}
        </Stat>
        <Stat icon="gauge" accent={effort?.accent ?? "indigo"} label="Cost to bid">
          {effort ? (
            <>
              <div className="flex items-center gap-2">
                <EffortBars bars={effort.bars} />
                <Badge tone={effort.tone}>{effort.label}</Badge>
              </div>
              <div className="mt-1 line-clamp-2 text-xs text-slate-400">{a.bid_effort.summary}</div>
            </>
          ) : (
            <Value>Not stated</Value>
          )}
        </Stat>
      </div>

      <div className="no-print relative flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-6 py-4 sm:px-8">
        <Button variant="primary" onClick={() => download(`${slug(ref)}-deadlines.ics`, buildIcs(report), "text/calendar")}>
          <Icon name="calendar" /> Add deadlines to calendar
        </Button>
        <Button onClick={() => document.getElementById("questions")?.scrollIntoView({ behavior: "smooth" })}>
          <Icon name="mail" /> Draft questions email
        </Button>
        <Button onClick={() => download(`${slug(ref)}-triage.json`, JSON.stringify(report, null, 2), "application/json")}>
          <Icon name="download" /> JSON
        </Button>
        <Button onClick={() => window.print()}>
          <Icon name="printer" /> Print / PDF
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <Badge tone={allVerified ? "green" : "amber"}>
            <Icon name="shield" size={11} />
            {v.quotes_verified}/{v.quotes_checked} citations verified
          </Badge>
          {v.date_issues > 0 && <Badge tone="red">{v.date_issues} date issue(s)</Badge>}
          <span>
            {report.page_count} pages · {(report.elapsed_ms / 1000).toFixed(1)}s{report.cached && " · cached"} · {report.model}
          </span>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, icon, accent, children }: { label: string; icon: IconName; accent: Accent; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 bg-slate-950/40 px-6 py-5 text-sm sm:px-8">
      <IconTile name={icon} accent={accent} size={16} />
      <div className="min-w-0">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</div>
        {children}
      </div>
    </div>
  );
}

function EffortBars({ bars }: { bars: number }) {
  const colors = ["bg-emerald-400", "bg-amber-400", "bg-rose-400"];
  return (
    <span className="flex items-end gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className={cx("w-1.5 rounded-sm", i < bars ? colors[bars - 1] : "bg-white/10")} style={{ height: 6 + i * 4 }} />
      ))}
    </span>
  );
}

function PreBidBadge({ status }: { status: A["pre_bid_meeting"]["status"] }) {
  if (status === "mandatory") return <Badge tone="red">Mandatory</Badge>;
  if (status === "optional") return <Badge tone="blue">Optional</Badge>;
  return <Badge>Not stated</Badge>;
}

function ScoreRing({ score, bid }: { score: number; bid: boolean }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const id = bid ? "ring-bid" : "ring-nobid";
  return (
    <div className="flex shrink-0 flex-col items-center">
      <svg width="136" height="136" viewBox="0 0 110 110" role="img" aria-label={`Fit score ${score} out of 10`}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            {bid ? (
              <>
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#22d3ee" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#fb7185" />
                <stop offset="100%" stopColor="#f472b6" />
              </>
            )}
          </linearGradient>
        </defs>
        <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" />
        <circle
          className="animate-ring"
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0.01, (score / 10) * c)} ${c}`}
          transform="rotate(-90 55 55)"
        />
        <text x="55" y="52" textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="32" fontWeight="700">
          {score}
        </text>
        <text x="55" y="76" textAnchor="middle" fill="#64748b" fontSize="11">
          out of 10
        </text>
      </svg>
      <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Fit score</span>
    </div>
  );
}

/* ---------------------------------- Why + score ---------------------------------- */

function WhyCard({ report }: { report: Report }) {
  const rec = report.analysis.recommendation;
  const bid = report.decision === "BID";
  return (
    <Card delay={60}>
      <SectionTitle icon="target" accent={bid ? "emerald" : "rose"}>
        Why {bid ? "we should bid" : "we should pass"}
      </SectionTitle>
      <ol className="space-y-3">
        {report.reasons.map((r, i) => (
          <li key={i} className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm leading-relaxed text-slate-200">
            <span
              className={cx(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white",
                bid ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-gradient-to-br from-rose-500 to-pink-600",
              )}
            >
              {i + 1}
            </span>
            <span className="pt-0.5">{r}</span>
          </li>
        ))}
      </ol>
      {rec.deal_breakers.length > 0 && (
        <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/[0.07] p-4">
          <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-300">
            <Icon name="x" size={13} /> Deal-breakers
          </h3>
          <ul className="space-y-1.5 text-sm text-rose-100/90">
            {rec.deal_breakers.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-rose-400">•</span>
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 rounded-xl border border-sky-400/20 bg-sky-500/[0.06] p-4">
        <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-300">
          <Icon name="help" size={13} /> What would change our mind
        </h3>
        <ul className="space-y-1.5 text-sm text-slate-300">
          {rec.what_would_change_mind.map((d, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-sky-400">•</span>
              {d}
            </li>
          ))}
        </ul>
      </div>
      {report.policy_notes.length > 0 && (
        <div className="mt-4 rounded-xl bg-white/[0.03] p-3 text-xs leading-relaxed text-slate-400">
          {report.policy_notes.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </div>
      )}
    </Card>
  );
}

function ScoreCard({ report }: { report: Report }) {
  const fit = report.analysis.fit;
  return (
    <Card delay={120}>
      <SectionTitle icon="chart" accent="violet" hint="The model rates each factor; fixed rules turn ratings into points.">
        How the score was built
      </SectionTitle>
      <ul className="space-y-5">
        {report.score_breakdown.map((l) => {
          const pct = (l.points / l.max) * 100;
          return (
            <li key={l.factor}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-slate-100">{l.factor}</span>
                <span className="font-mono text-xs text-slate-400">
                  <span className="text-slate-200">{l.points.toFixed(2).replace(/\.00$/, "")}</span> / {l.max}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={cx(
                    "h-full rounded-full bg-gradient-to-r transition-all duration-1000",
                    pct >= 60 ? "from-emerald-500 to-teal-400" : pct >= 40 ? "from-amber-500 to-yellow-400" : "from-rose-500 to-pink-500",
                  )}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{l.reason}</p>
            </li>
          );
        })}
      </ul>
      {fit.matched_capabilities.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] pt-4">
          <span className="mr-1 text-xs text-slate-500">Uses our:</span>
          {fit.matched_capabilities.map((c) => (
            <Badge key={c} tone="violet">
              {c}
            </Badge>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------- Cost to bid ---------------------------------- */

function EffortCard({ a }: { a: A }) {
  if (!a.bid_effort) return null;
  const meta = EFFORT[a.bid_effort.level];
  return (
    <Card id="effort">
      <SectionTitle
        icon="gauge"
        accent={meta.accent}
        hint="How much work the proposal itself takes, based only on what the RFP asks for. No hours or dollars are guessed."
        right={
          <div className="flex items-center gap-2">
            <EffortBars bars={meta.bars} />
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
        }
      >
        Cost to bid
      </SectionTitle>
      <p className="mb-4 text-[15px] leading-relaxed text-slate-200">{a.bid_effort.summary}</p>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {a.bid_effort.drivers.map((d, i) => (
          <li key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 text-sm transition hover:border-white/15">
            <div className="font-medium text-white">{d.driver}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-400">{d.detail}</p>
            <Cite quote={d.quote} page={d.page} check={d.check} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------------- At a glance ---------------------------------- */

function GlanceCard({ a }: { a: A }) {
  const f = a.facts;
  const items: [string, IconName, A["facts"][keyof A["facts"]]][] = [
    ["Contract value", "dollar", f.contract_value],
    ["Contract type", "file", f.contract_type],
    ["Term", "clock", f.contract_term],
    ["Place of performance", "building", f.place_of_performance],
    ["How to submit", "upload", f.submission_method],
    ["Award basis", "scale", f.award_basis],
    ["Set-aside / preference", "shield", f.set_aside],
    ["Funding", "briefcase", f.funding_source],
  ];
  const pb = a.pre_bid_meeting;
  return (
    <Card id="glance">
      <SectionTitle icon="building" accent="cyan">
        At a glance
      </SectionTitle>
      <p className="text-[15px] leading-relaxed text-slate-200">{a.summary}</p>
      {a.scope_highlights.length > 0 && (
        <ul className="mt-4 grid gap-2 md:grid-cols-2">
          {a.scope_highlights.map((s, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-slate-300">
              <Icon name="check" size={15} className="mt-0.5 text-cyan-400" />
              {s}
            </li>
          ))}
        </ul>
      )}
      <dl className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map(([label, icon, fact]) => (
          <div key={label} className="rounded-xl border border-white/[0.06] bg-slate-950/40 p-3.5">
            <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              <Icon name={icon} size={12} />
              {label}
            </dt>
            <dd className="mt-1.5 text-sm leading-snug text-slate-100">
              <Value>{fact.value}</Value>
            </dd>
            <Cite {...fact} />
          </div>
        ))}
      </dl>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/[0.06] bg-slate-950/40 p-4 text-sm">
          <div className="mb-3 flex items-center gap-2">
            <Icon name="users" size={15} className="text-cyan-300" />
            <span className="font-medium text-white">Pre-bid meeting / site visit</span>
            <PreBidBadge status={pb.status} />
          </div>
          {pb.status === "not_stated" ? (
            <Value>Not stated</Value>
          ) : (
            <dl className="grid grid-cols-[90px_1fr] gap-y-1.5 text-slate-300">
              <dt className="text-slate-500">When</dt>
              <dd>{pb.when}</dd>
              <dt className="text-slate-500">Where</dt>
              <dd>
                <Value>{pb.where}</Value>
              </dd>
              <dt className="text-slate-500">Register</dt>
              <dd>
                <Value>{pb.registration}</Value>
              </dd>
              <dt className="text-slate-500">If missed</dt>
              <dd className={pb.status === "mandatory" ? "text-rose-300" : ""}>
                <Value>{pb.consequence_if_missed}</Value>
              </dd>
            </dl>
          )}
          <Cite quote={pb.quote} page={pb.page} check={pb.check} />
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-slate-950/40 p-4 text-sm">
          <div className="mb-3 flex items-center gap-2">
            <Icon name="mail" size={15} className="text-cyan-300" />
            <span className="font-medium text-white">Procurement contact</span>
          </div>
          <dl className="grid grid-cols-[90px_1fr] gap-y-1.5 text-slate-300">
            <dt className="text-slate-500">Name</dt>
            <dd>
              <Value>{a.procurement_contact.name}</Value>
            </dd>
            <dt className="text-slate-500">Email</dt>
            <dd className="break-all">
              <Value>{a.procurement_contact.email}</Value>
            </dd>
            <dt className="text-slate-500">Phone</dt>
            <dd>
              <Value>{a.procurement_contact.phone}</Value>
            </dd>
          </dl>
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------- Dates timeline ---------------------------------- */

const DATE_CHECK: Record<string, { tone: Tone; label: string } | undefined> = {
  mismatch: { tone: "red", label: "date mismatch" },
  not_in_document: { tone: "amber", label: "date text not found" },
};

function DatesCard({ a }: { a: A }) {
  const dates = useMemo(
    () =>
      [...a.key_dates].sort((x, y) => {
        if (!x.date_iso) return 1;
        if (!y.date_iso) return -1;
        return x.date_iso.localeCompare(y.date_iso);
      }),
    [a.key_dates],
  );
  const nextIdx = dates.findIndex((d) => d.date_iso && d.status !== "superseded" && daysUntil(d.date_iso) >= 0);

  return (
    <Card id="dates">
      <SectionTitle icon="calendar" accent="indigo" hint="Every date is re-read from the document text and checked against the calendar date.">
        Key dates
      </SectionTitle>
      <ol className="relative ml-2 border-l border-white/10">
        {dates.map((d, i) => {
          const days = d.date_iso ? daysUntil(d.date_iso) : null;
          const superseded = d.status === "superseded";
          const past = days !== null && days < 0;
          const next = i === nextIdx;
          const flag = DATE_CHECK[d.date_check ?? ""];
          return (
            <li key={i} className={cx("relative pb-6 pl-7 last:pb-0", (superseded || past) && "opacity-55")}>
              <span
                className={cx(
                  "absolute -left-[7px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-slate-950",
                  superseded ? "bg-slate-600" : d.mandatory ? "bg-rose-400" : next ? "pulse-ring bg-indigo-400" : past ? "bg-slate-500" : "bg-cyan-400",
                )}
              />
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cx("font-mono text-sm font-semibold text-white", superseded && "line-through")}>
                      {formatDate(d.date_iso, d.as_written)}
                    </span>
                    {d.time && <span className="text-xs text-slate-400">{d.time}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className={cx("text-sm text-slate-200", superseded && "line-through")}>{d.event}</span>
                    {d.mandatory && <Badge tone="red">Mandatory</Badge>}
                    {superseded && <Badge>Superseded</Badge>}
                    {d.status === "tentative" && <Badge tone="blue">Anticipated</Badge>}
                    {next && <Badge tone="violet">Next up</Badge>}
                    {flag && <Badge tone={flag.tone}>{flag.label}</Badge>}
                  </div>
                  {d.note && <div className="mt-1 text-xs text-amber-200/80">{d.note}</div>}
                  <Cite quote={d.quote} page={d.page} check={d.check} />
                </div>
                {days !== null && !superseded && (
                  <span
                    className={cx(
                      "shrink-0 self-start rounded-full px-2.5 py-1 text-xs font-medium",
                      past ? "bg-white/5 text-slate-500" : days <= 7 ? "bg-rose-500/15 text-rose-300" : days <= 21 ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/10 text-emerald-300",
                    )}
                  >
                    {countdownLabel(days)}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/* ---------------------------------- Requirements ---------------------------------- */

const STATUS: Record<string, { tone: Tone; label: string }> = {
  meets: { tone: "green", label: "We meet" },
  gap: { tone: "red", label: "Gap" },
  unknown: { tone: "amber", label: "Verify" },
  not_applicable: { tone: "slate", label: "N/A" },
};

function RequirementsCard({ a }: { a: A }) {
  const [filter, setFilter] = useState<"all" | "must" | "attention">("all");
  const rows = a.requirements.filter((r) =>
    filter === "must" ? r.mandatory : filter === "attention" ? r.company_status === "gap" || r.company_status === "unknown" : true,
  );
  const count = (s: string) => a.requirements.filter((r) => r.company_status === s).length;
  return (
    <Card id="requirements">
      <SectionTitle
        icon="shield"
        accent="emerald"
        hint="Every must-have, checked against the company profile."
        right={
          <div className="no-print flex rounded-xl border border-white/10 bg-slate-950/50 p-1 text-xs">
            {(
              [
                ["all", `All (${a.requirements.length})`],
                ["must", "Must-haves"],
                ["attention", "Gaps & verify"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={cx("rounded-lg px-3 py-1.5 transition", filter === k ? "bg-indigo-500 text-white shadow" : "text-slate-400 hover:text-white")}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        Requirements & eligibility
      </SectionTitle>

      <div className="mb-5 grid grid-cols-3 gap-3">
        {(
          [
            ["meets", "We meet", "text-emerald-300", "from-emerald-500/15"],
            ["unknown", "To verify", "text-amber-300", "from-amber-500/15"],
            ["gap", "Gaps", "text-rose-300", "from-rose-500/15"],
          ] as const
        ).map(([k, label, color, from]) => (
          <div key={k} className={cx("rounded-xl border border-white/[0.06] bg-gradient-to-br to-transparent p-3", from)}>
            <div className={cx("text-2xl font-bold", color)}>{count(k)}</div>
            <div className="text-xs text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      <div className="-mx-5 overflow-x-auto sm:-mx-6">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-[0.1em] text-slate-500">
            <tr className="border-b border-white/[0.06]">
              <th className="px-5 py-2.5 font-semibold sm:px-6">Requirement</th>
              <th className="py-2.5 font-semibold">Type</th>
              <th className="py-2.5 font-semibold">Our status</th>
              <th className="px-5 py-2.5 font-semibold sm:px-6">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-white/[0.04] align-top transition last:border-0 hover:bg-white/[0.02]">
                <td className="px-5 py-3.5 sm:px-6">
                  <div className="text-slate-100">{r.requirement}</div>
                  <div className="mt-0.5 text-[11px] capitalize text-slate-500">{r.category.replace(/_/g, " ")}</div>
                </td>
                <td className="py-3.5 pr-3">
                  <Badge tone={r.mandatory ? "violet" : "blue"}>{r.mandatory ? "Must" : "Desired"}</Badge>
                </td>
                <td className="max-w-[280px] py-3.5 pr-3">
                  <Badge tone={STATUS[r.company_status].tone}>{STATUS[r.company_status].label}</Badge>
                  <div className="mt-1 text-xs leading-relaxed text-slate-400">{r.company_note}</div>
                </td>
                <td className="px-5 py-3.5 sm:px-6">
                  <Cite quote={r.quote} page={r.page} check={r.check} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                  Nothing in this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---------------------------------- Submission ---------------------------------- */

function SubmissionCard({ a }: { a: A }) {
  const [done, setDone] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setDone((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  const total = a.documents_to_submit.length;
  return (
    <div id="submission" className="grid scroll-mt-24 gap-6 xl:grid-cols-[3fr_2fr]">
      <Card>
        <SectionTitle
          icon="list"
          accent="cyan"
          hint="Use it as a working checklist."
          right={
            <span className="text-xs text-slate-400">
              <span className="font-semibold text-white">{done.size}</span> / {total} ready
            </span>
          }
        >
          Documents to submit
        </SectionTitle>
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-400 transition-all duration-500"
            style={{ width: `${total ? (done.size / total) * 100 : 0}%` }}
          />
        </div>
        <ul className="space-y-2">
          {a.documents_to_submit.map((d, i) => (
            <li
              key={i}
              className={cx(
                "flex gap-3 rounded-xl border p-3 transition",
                done.has(i) ? "border-emerald-400/20 bg-emerald-500/[0.05]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/15",
              )}
            >
              <button
                onClick={() => toggle(i)}
                aria-label={`Mark ${d.name} as ${done.has(i) ? "not done" : "done"}`}
                className={cx(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
                  done.has(i) ? "border-emerald-400 bg-emerald-500 text-white" : "border-white/20 hover:border-white/40",
                )}
              >
                {done.has(i) && <Icon name="check" size={12} />}
              </button>
              <div className="min-w-0 flex-1 text-sm">
                <div className={cx("font-medium", done.has(i) ? "text-slate-500 line-through" : "text-slate-100")}>{d.name}</div>
                {d.details && <div className="mt-0.5 text-xs text-slate-400">{d.details}</div>}
              </div>
              <Cite quote={d.quote} page={d.page} check={d.check} />
            </li>
          ))}
        </ul>
        <div className="mt-4 flex gap-2.5 rounded-xl border border-indigo-400/20 bg-indigo-500/[0.07] p-3.5 text-sm">
          <Icon name="upload" size={16} className="mt-0.5 text-indigo-300" />
          <div>
            <span className="font-medium text-white">How to submit: </span>
            <span className="text-slate-300">
              <Value>{a.facts.submission_method.value}</Value>
            </span>
          </div>
        </div>
      </Card>
      <Card>
        <SectionTitle icon="dollar" accent="amber">
          Bid security, bonds & insurance
        </SectionTitle>
        <div
          className={cx(
            "mb-4 rounded-xl border p-4 text-sm",
            a.bid_security.required === "yes" ? "border-amber-400/25 bg-amber-500/[0.07]" : "border-white/[0.06] bg-slate-950/40",
          )}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Bid security (with proposal)</div>
          <div className="mt-1 font-medium text-white">
            {a.bid_security.required === "yes" ? a.bid_security.details : a.bid_security.required === "no" ? "Not required" : <Value>Not stated</Value>}
          </div>
          <Cite quote={a.bid_security.quote} page={a.bid_security.page} check={a.bid_security.check} />
        </div>
        {a.bonds_and_insurance.length === 0 ? (
          <Value>Not stated</Value>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {a.bonds_and_insurance.map((b, i) => (
              <li key={i} className="py-3 text-sm first:pt-0">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium text-slate-100">{b.type}</span>
                  <span className="text-right font-mono text-xs text-amber-200/90">{b.amount}</span>
                </div>
                {!isNotStated(b.when_due) && <div className="mt-0.5 text-xs text-slate-500">{b.when_due}</div>}
                <Cite quote={b.quote} page={b.page} check={b.check} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ---------------------------------- Risks ---------------------------------- */

const SEVERITY: Record<string, { tone: Tone; border: string }> = {
  high: { tone: "red", border: "border-l-rose-400" },
  medium: { tone: "amber", border: "border-l-amber-400" },
  low: { tone: "slate", border: "border-l-slate-500" },
};

function RisksCard({ a }: { a: A }) {
  const order = ["high", "medium", "low"];
  const risks = [...a.disqualification_risks].sort((x, y) => order.indexOf(x.severity) - order.indexOf(y.severity));
  const high = risks.filter((r) => r.severity === "high").length;
  return (
    <Card id="risks">
      <SectionTitle
        icon="alert"
        accent="rose"
        hint="Fine print that can get a proposal thrown out or make the contract painful."
        right={high > 0 ? <Badge tone="red">{high} can disqualify you</Badge> : undefined}
      >
        Disqualification risks & fine-print traps
      </SectionTitle>
      <ul className="grid gap-3 md:grid-cols-2">
        {risks.map((r, i) => (
          <li key={i} className={cx("rounded-xl border border-l-[3px] border-white/[0.06] bg-white/[0.02] p-4 text-sm", SEVERITY[r.severity].border)}>
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-white">{r.title}</span>
              <Badge tone={SEVERITY[r.severity].tone}>{r.severity}</Badge>
            </div>
            <p className="mt-1.5 leading-relaxed text-slate-400">{r.consequence}</p>
            <Cite quote={r.quote} page={r.page} check={r.check} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------------- Questions ---------------------------------- */

function QuestionsCard({ report, refLabel }: { report: Report; refLabel: string }) {
  const a = report.analysis;
  const email = useMemo(() => buildQuestionsEmail(report), [report]);
  const [copied, setCopied] = useState(false);
  const qDue = a.key_dates.find((d) => d.category === "questions_due" && d.status !== "superseded");
  const qDays = qDue?.date_iso ? daysUntil(qDue.date_iso) : null;
  const mailto = `mailto:${encodeURIComponent(email.to)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;

  return (
    <Card id="questions">
      <SectionTitle
        icon="help"
        accent="amber"
        hint={
          qDue ? (
            <>
              Questions are due {qDue.as_written}
              {qDue.time && `, ${qDue.time}`}
              {qDays !== null && qDays >= 0 && <span className="text-amber-300"> ({countdownLabel(qDays)})</span>}.
            </>
          ) : (
            "No questions deadline stated."
          )
        }
      >
        Ambiguities & questions for the agency
      </SectionTitle>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-5">
          {a.ambiguities.length > 0 && (
            <div>
              <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-300">Flagged as ambiguous</h3>
              <ul className="space-y-3">
                {a.ambiguities.map((x, i) => (
                  <li key={i} className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-4 text-sm">
                    <div className="font-medium text-amber-50">{x.issue}</div>
                    <ul className="mt-2 space-y-1 text-slate-300">
                      {x.possible_readings.map((p, j) => (
                        <li key={j} className="flex gap-2">
                          <span className="font-mono text-xs text-amber-400">{String.fromCharCode(65 + j)}.</span>
                          {p}
                        </li>
                      ))}
                    </ul>
                    <Cite quote={x.quote} page={x.page} check={x.check} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Open questions</h3>
            {a.open_questions.length === 0 ? (
              <p className="text-sm text-slate-500">None.</p>
            ) : (
              <ol className="space-y-2">
                {a.open_questions.map((q, i) => (
                  <li key={i} className="flex gap-3 text-sm text-slate-200">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/[0.06] font-mono text-[11px] text-slate-400">{i + 1}</span>
                    {q}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
        <div className="no-print">
          <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Ready-to-send email</h3>
          <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/70">
            <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
            </div>
            <div className="space-y-0.5 border-b border-white/[0.06] px-4 py-2.5 text-xs text-slate-300">
              <div>
                <span className="inline-block w-14 text-slate-500">To</span> {email.to || <Value>Not stated</Value>}
              </div>
              <div>
                <span className="inline-block w-14 text-slate-500">Subject</span> {email.subject}
              </div>
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap px-4 py-3 font-sans text-[13px] leading-relaxed text-slate-300">{email.body}</pre>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={mailto}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-3.5 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-400 hover:to-violet-400"
            >
              <Icon name="mail" /> Open in email app
            </a>
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              <Icon name={copied ? "check" : "copy"} /> {copied ? "Copied" : "Copy text"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Check the RFP&apos;s rules for questions ({refLabel}) before sending. Nothing is sent automatically.</p>
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------- JSON ---------------------------------- */

function JsonCard({ report }: { report: Report }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(report, null, 2);
  return (
    <Card id="json" className="no-print">
      <SectionTitle
        icon="code"
        accent="violet"
        hint="The same data, machine-readable. Also available from POST /api/analyze."
        right={
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(json);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Icon name={copied ? "check" : "copy"} /> {copied ? "Copied" : "Copy JSON"}
          </Button>
        }
      >
        JSON output
      </SectionTitle>
      <details className="group">
        <summary className="cursor-pointer text-sm text-slate-400 transition hover:text-white">Show full JSON ({(json.length / 1024).toFixed(0)} KB)</summary>
        <pre className="mt-3 max-h-[480px] overflow-auto rounded-xl border border-white/[0.06] bg-black/40 p-4 font-mono text-xs leading-relaxed text-emerald-200/90">
          {json}
        </pre>
      </details>
    </Card>
  );
}
