"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Board } from "@/components/Board";
import { ProfileDialog } from "@/components/ProfileDialog";
import { ReportView } from "@/components/ReportView";
import { Badge, Button, Card, Icon, IconTile, cx, type Accent, type IconName } from "@/components/ui";
import { loadHistory, loadProfile, removeFromHistory, saveProfile, saveToHistory, type SavedReport } from "@/lib/history";
import { DEFAULT_PROFILE } from "@/lib/profile";
import type { Report } from "@/lib/report";

const SAMPLES = [
  { file: "Sample-RFP-1-Port-Alder-Permit-Automation.pdf", title: "AI Permit Automation Platform", agency: "City of Port Alder, WA", pages: 17, accent: "indigo" as Accent },
  { file: "Sample-RFP-2-Larkspur-County-Janitorial.pdf", title: "Janitorial & Custodial Services", agency: "Larkspur County, OH", pages: 12, accent: "rose" as Accent },
];

const FEATURES: [IconName, string, Accent][] = [
  ["target", "Bid / no-bid in under a minute", "emerald"],
  ["shield", "Every fact cited & verified", "indigo"],
  ["calendar", "Deadlines straight to your calendar", "cyan"],
  ["alert", "Fine-print traps flagged", "rose"],
];

const STEPS = [
  { key: "extract", label: "Extracting text from every page", icon: "file" },
  { key: "screen", label: "Quick domain screen", icon: "sparkles" },
  { key: "analyze", label: "Deep read: dates, requirements, fine print", icon: "list" },
  { key: "verify", label: "Verifying quotes & dates against the PDF", icon: "shield" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

interface Screen {
  work_category: string;
  domain_alignment: "core" | "adjacent" | "outside";
  reason: string;
  elapsed_ms: number;
}

type Phase = { kind: "idle" } | { kind: "working"; fileName: string } | { kind: "done" } | { kind: "error"; message: string };

export default function Home() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [step, setStep] = useState<StepKey>("extract");
  const [message, setMessage] = useState("");
  const [screen, setScreen] = useState<Screen | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState<SavedReport[]>([]);
  const [customProfile, setCustomProfile] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const lastInput = useRef<{ fileName: string; pages: string[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Browser storage is only readable after mount.
  useEffect(() => {
    setHistory(loadHistory()); // eslint-disable-line react-hooks/set-state-in-effect
    setCustomProfile(loadProfile());
  }, []);

  useEffect(() => {
    if (phase.kind !== "working") return;
    const start = Date.now();
    const t = setInterval(() => setElapsed((Date.now() - start) / 1000), 100);
    return () => clearInterval(t);
  }, [phase.kind]);

  /** Sends extracted pages (preferred) or, as a fallback, the PDF itself for server-side extraction. */
  const analyze = useCallback(
    async (fileName: string, source: { pages: string[] } | { file: File }) => {
      let body: BodyInit;
      let headers: HeadersInit | undefined;
      if ("pages" in source) {
        lastInput.current = { fileName, pages: source.pages };
        body = JSON.stringify({ fileName, pages: source.pages, profile: customProfile ?? undefined });
        headers = { "Content-Type": "application/json" };
      } else {
        lastInput.current = null;
        const form = new FormData();
        form.append("file", source.file);
        if (customProfile) form.append("profile", customProfile);
        body = form;
      }
      setStep("screen");
      const res = await fetch("/api/analyze?stream=1", { method: "POST", headers, body });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
        throw new Error(err.error ?? `Server error (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line);
          if (evt.type === "progress") {
            setStep(evt.step);
            setMessage(evt.message);
          } else if (evt.type === "screen") {
            setScreen(evt.data);
          } else if (evt.type === "report") {
            const r = evt.data as Report;
            setReport(r);
            setHistory(saveToHistory(r));
            setPhase({ kind: "done" });
            window.scrollTo({ top: 0 });
            return;
          } else if (evt.type === "error") {
            throw new Error(evt.message);
          }
        }
      }
      throw new Error("The connection closed before the report was ready. Please try again.");
    },
    [customProfile],
  );

  const runFile = useCallback(
    async (file: File) => {
      setPhase({ kind: "working", fileName: file.name });
      setStep("extract");
      setMessage("");
      setScreen(null);
      setReport(null);
      try {
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Please upload a PDF file.");
        let pages: string[] | null = null;
        try {
          const { extractPages } = await import("@/lib/pdf-text");
          pages = await extractPages(new Uint8Array(await file.arrayBuffer()));
        } catch (err) {
          console.warn("In-browser text extraction failed; letting the server extract instead.", err);
          if (file.size > 4 * 1024 * 1024) throw new Error("This PDF could not be read in the browser and is too large to upload (4 MB max).");
        }
        if (pages) setMessage(`Extracted ${pages.length} pages.`);
        await analyze(file.name, pages ? { pages } : { file });
      } catch (err) {
        setPhase({ kind: "error", message: (err as Error).message || "Something went wrong." });
      }
    },
    [analyze],
  );

  const runSample = async (name: string) => {
    const blob = await (await fetch(`/samples/${name}`)).blob();
    runFile(new File([blob], name, { type: "application/pdf" }));
  };

  const rerun = async () => {
    if (!lastInput.current) return;
    setPhase({ kind: "working", fileName: lastInput.current.fileName });
    setScreen(null);
    setReport(null);
    try {
      await analyze(lastInput.current.fileName, { pages: lastInput.current.pages });
    } catch (err) {
      setPhase({ kind: "error", message: (err as Error).message });
    }
  };

  const working = phase.kind === "working";

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-20 border-b border-white/[0.06] bg-[#070a12]/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <button onClick={() => !working && setPhase({ kind: "idle" })} className="flex items-center gap-2.5" disabled={working}>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-400 shadow-lg shadow-indigo-500/30">
              <Icon name="target" size={17} className="text-white" />
            </span>
            <span className="text-[17px] font-semibold tracking-tight text-white">BidScope</span>
            <span className="hidden rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-400 sm:inline">RFP Triage Agent</span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            {phase.kind === "done" && (
              <Button variant="primary" onClick={() => setPhase({ kind: "idle" })}>
                <Icon name="plus" /> <span className="hidden sm:inline">New RFP</span>
              </Button>
            )}
            <Button variant="ghost" onClick={() => setProfileOpen(true)}>
              <Icon name="briefcase" />
              <span className="hidden sm:inline">Company profile</span>
              <Badge tone={customProfile ? "violet" : "slate"}>{customProfile ? "custom" : "idiaz.io"}</Badge>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {phase.kind === "done" && report ? (
          <>
            {lastInput.current && (customProfile ?? DEFAULT_PROFILE) !== report.profile_used && (
              <div className="no-print animate-fade-up mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-400/25 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
                <span className="flex items-center gap-2">
                  <Icon name="briefcase" className="text-violet-300" /> The company profile changed since this report was made.
                </span>
                <Button variant="primary" onClick={rerun}>
                  Re-score with the new profile
                </Button>
              </div>
            )}
            <ReportView report={report} />
          </>
        ) : (
          <div className="mx-auto max-w-4xl space-y-8">
            {!working && <Hero />}

            {working ? (
              <ProgressCard fileName={phase.fileName} step={step} message={message} screen={screen} elapsed={elapsed} />
            ) : (
              <div className="animate-fade-up space-y-4" style={{ animationDelay: "80ms" }}>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const f = e.dataTransfer.files[0];
                    if (f) runFile(f);
                  }}
                  onClick={() => fileInput.current?.click()}
                  className={cx(
                    "group relative cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed p-1 transition",
                    dragging ? "border-indigo-400 bg-indigo-500/10" : "border-white/15 bg-slate-900/40 hover:border-indigo-400/60 hover:bg-indigo-500/[0.04]",
                  )}
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(500px_200px_at_50%_0%,rgba(99,102,241,0.15),transparent_70%)] opacity-0 transition group-hover:opacity-100" />
                  <div className="relative flex flex-col items-center justify-center px-6 py-14 text-center">
                    <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-xl shadow-indigo-500/30 transition group-hover:scale-105">
                      <Icon name="upload" size={28} />
                    </span>
                    <p className="mt-5 text-lg font-semibold text-white">Drop an RFP PDF here</p>
                    <p className="mt-1 text-sm text-slate-400">or click to choose a file · text-based PDFs up to ~100 pages</p>
                    <span className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg transition group-hover:bg-indigo-50">
                      <Icon name="file" /> Choose PDF
                    </span>
                    <input
                      ref={fileInput}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) runFile(f);
                      }}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {SAMPLES.map((s) => (
                    <button
                      key={s.file}
                      onClick={() => runSample(s.file)}
                      className="group flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-slate-900/50 p-4 text-left transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-slate-900/80"
                    >
                      <IconTile name="file" accent={s.accent} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Try a sample RFP</div>
                        <div className="truncate font-medium text-white">{s.title}</div>
                        <div className="text-xs text-slate-400">
                          {s.agency} · {s.pages} pages
                        </div>
                      </div>
                      <Icon name="arrow" className="text-slate-500 transition group-hover:translate-x-1 group-hover:text-white" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {phase.kind === "error" && (
              <div className="animate-fade-up flex gap-3 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
                <Icon name="alert" size={18} className="mt-0.5 text-rose-300" />
                <div>
                  <div className="font-semibold text-rose-200">Couldn&apos;t analyse that RFP</div>
                  <div className="mt-0.5 text-rose-100/80">{phase.message}</div>
                </div>
              </div>
            )}

            {!working && (
              <>
                <Board
                  items={history}
                  onOpen={(s) => {
                    lastInput.current = null;
                    setReport(s.report);
                    setPhase({ kind: "done" });
                  }}
                  onRemove={(id) => setHistory(removeFromHistory(id))}
                />
                <HowItWorks />
              </>
            )}
          </div>
        )}
      </main>

      <footer className="no-print mx-auto max-w-7xl px-4 pb-10 text-center text-xs text-slate-500 sm:px-6">
        AI-assisted triage. Every fact links to its page; anything marked unverified should be checked in the PDF before acting on it.
      </footer>

      <ProfileDialog
        open={profileOpen}
        profile={customProfile ?? DEFAULT_PROFILE}
        onClose={() => setProfileOpen(false)}
        onSave={(p) => {
          saveProfile(p);
          setCustomProfile(p);
        }}
      />
    </div>
  );
}

function Hero() {
  return (
    <div className="animate-fade-up pt-6 text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-indigo-400/25 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-200">
        <Icon name="sparkles" size={13} /> AI agent that reads the fine print
      </span>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-6xl">
        Should we <span className="text-gradient">bid</span> on this RFP?
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
        Drop in a government RFP. Get a bid / no-bid call, a fit score, every deadline, the must-haves and the fine-print traps, each one linked to the page
        it came from.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        {FEATURES.map(([icon, label, accent]) => (
          <span key={label} className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] py-1 pl-1 pr-3 text-xs text-slate-300">
            <span className="scale-75">
              <IconTile name={icon} accent={accent} size={16} />
            </span>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps: [IconName, string, string, Accent][] = [
    ["upload", "Drop the PDF", "Text is extracted page by page in your browser.", "indigo"],
    ["sparkles", "The agent reads all of it", "Dates, requirements, bonds, traps, scored against our profile.", "violet"],
    ["shield", "Every fact is checked", "Quotes and dates are matched back to the PDF text.", "emerald"],
    ["target", "Decide & act", "Bid call, calendar file, questions email, checklist.", "cyan"],
  ];
  return (
    <Card delay={200}>
      <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">How it works</p>
      <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(([icon, title, text, accent], i) => (
          <li key={title} className="flex gap-3">
            <IconTile name={icon} accent={accent} />
            <div>
              <div className="text-sm font-medium text-white">
                <span className="mr-1.5 font-mono text-xs text-slate-500">0{i + 1}</span>
                {title}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-400">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ProgressCard({ fileName, step, message, screen, elapsed }: { fileName: string; step: StepKey; message: string; screen: Screen | null; elapsed: number }) {
  const current = STEPS.findIndex((s) => s.key === step);
  const pct = Math.min(95, ((current + 0.5) / STEPS.length) * 100);
  return (
    <div className="animate-fade-up mx-auto max-w-2xl pt-10">
      <Card className="p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <IconTile name="file" accent="indigo" />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Analysing</div>
              <div className="truncate font-medium text-white">{fileName}</div>
            </div>
          </div>
          <span className="rounded-lg bg-white/[0.05] px-2.5 py-1 font-mono text-sm tabular-nums text-slate-300">{elapsed.toFixed(1)}s</span>
        </div>

        <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="relative h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 transition-all duration-700" style={{ width: `${pct}%` }}>
            <div className="animate-shimmer absolute inset-0" />
          </div>
        </div>

        <ol className="mt-6 space-y-3.5">
          {STEPS.map((s, i) => {
            const state = i < current || (s.key === "screen" && screen) ? "done" : i === current ? "active" : "todo";
            return (
              <li key={s.key} className="flex items-center gap-3 text-sm">
                <span
                  className={cx(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition",
                    state === "done" && "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/30",
                    state === "active" && "pulse-ring bg-indigo-500/20 text-indigo-200 ring-1 ring-inset ring-indigo-400/40",
                    state === "todo" && "bg-white/[0.03] text-slate-600 ring-1 ring-inset ring-white/10",
                  )}
                >
                  <Icon name={state === "done" ? "check" : s.icon} size={14} />
                </span>
                <span className={cx(state === "todo" ? "text-slate-500" : state === "active" ? "font-medium text-white" : "text-slate-300")}>{s.label}</span>
              </li>
            );
          })}
        </ol>
        {message && <p className="mt-5 text-sm text-slate-400">{message}</p>}
        {screen && (
          <div
            className={cx(
              "animate-fade-up mt-5 flex gap-3 rounded-xl border px-4 py-3.5 text-sm",
              screen.domain_alignment === "outside" ? "border-rose-400/25 bg-rose-500/10 text-rose-100" : "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
            )}
          >
            <Icon name="sparkles" size={16} className={cx("mt-0.5", screen.domain_alignment === "outside" ? "text-rose-300" : "text-emerald-300")} />
            <div>
              <div className="font-semibold">
                Quick screen in {(screen.elapsed_ms / 1000).toFixed(1)}s: {screen.work_category}:{" "}
                {screen.domain_alignment === "outside" ? "outside our domain, likely NO BID." : `${screen.domain_alignment} to what we build.`}
              </div>
              <div className="mt-0.5 opacity-80">{screen.reason} Full report on its way…</div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
