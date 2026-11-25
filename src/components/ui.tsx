"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import type { Check } from "@/lib/report";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/* ---------- Icons (lucide-style strokes, inline so there is no icon dependency) ---------- */

const ICONS = {
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  alert: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4M12 17h.01" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  file: <><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5M12 3v12" /></>,
  printer: <><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>,
  code: <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  target: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>,
  help: <><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" /></>,
  building: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" /></>,
  sparkles: <path d="M12 3l1.9 5.8L20 10.7l-6.1 1.9L12 18.5l-1.9-5.9L4 10.7l6.1-1.9z" />,
  list: <path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8" />,
  gauge: <><path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" /></>,
  briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>,
  chart: <path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3" />,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  scale: <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1ZM2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1ZM7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M5 12h14M12 5l7 7-7 7" />,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  dollar: <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className, size = 16 }: { name: IconName; className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("shrink-0", className)}
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

/* ---------- Surfaces ---------- */

export function Card({
  children,
  className,
  id,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  delay?: number;
}) {
  return (
    <section
      id={id}
      style={{ animationDelay: `${delay}ms` } as CSSProperties}
      className={cx(
        "animate-fade-up print-break scroll-mt-24 rounded-2xl border border-white/[0.08] bg-slate-900/50 p-5 shadow-xl shadow-black/20 backdrop-blur-sm sm:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

const ACCENTS = {
  indigo: "from-indigo-500/25 to-indigo-500/5 text-indigo-300 ring-indigo-400/30",
  emerald: "from-emerald-500/25 to-emerald-500/5 text-emerald-300 ring-emerald-400/30",
  rose: "from-rose-500/25 to-rose-500/5 text-rose-300 ring-rose-400/30",
  amber: "from-amber-500/25 to-amber-500/5 text-amber-300 ring-amber-400/30",
  cyan: "from-cyan-500/25 to-cyan-500/5 text-cyan-300 ring-cyan-400/30",
  violet: "from-violet-500/25 to-violet-500/5 text-violet-300 ring-violet-400/30",
} as const;

export type Accent = keyof typeof ACCENTS;

export function IconTile({ name, accent = "indigo", size = 18 }: { name: IconName; accent?: Accent; size?: number }) {
  return (
    <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-inset", ACCENTS[accent])}>
      <Icon name={name} size={size} />
    </span>
  );
}

export function SectionTitle({
  children,
  hint,
  right,
  icon,
  accent = "indigo",
}: {
  children: ReactNode;
  hint?: ReactNode;
  right?: ReactNode;
  icon?: IconName;
  accent?: Accent;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {icon && <IconTile name={icon} accent={accent} />}
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-white">{children}</h2>
          {hint && <p className="mt-0.5 text-[13px] text-slate-400">{hint}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

const TONES = {
  slate: "bg-white/[0.06] text-slate-300 ring-white/10",
  green: "bg-emerald-500/10 text-emerald-300 ring-emerald-400/30",
  red: "bg-rose-500/10 text-rose-300 ring-rose-400/30",
  amber: "bg-amber-500/10 text-amber-300 ring-amber-400/30",
  blue: "bg-sky-500/10 text-sky-300 ring-sky-400/30",
  violet: "bg-violet-500/10 text-violet-300 ring-violet-400/30",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ children, tone = "slate", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function isNotStated(v: string | null | undefined) {
  return !v || /^not stated\.?$/i.test(v.trim());
}

export function Value({ children }: { children: string | null | undefined }) {
  if (isNotStated(children)) return <span className="italic text-slate-500">Not stated</span>;
  return <>{children}</>;
}

const CHECK_META: Record<Check, { label: string; tone: Tone; title: string }> = {
  exact: { label: "verified", tone: "green", title: "Quote found word-for-word on this page" },
  page_corrected: { label: "verified", tone: "green", title: "Quote found word-for-word (page number corrected)" },
  fuzzy: { label: "close match", tone: "amber", title: "Most of the quote was found; check the wording" },
  unverified: { label: "unverified", tone: "red", title: "Quote NOT found in the PDF text; check before relying on it" },
  none: { label: "", tone: "slate", title: "" },
};

/** Page reference + verification badge; click to reveal the supporting quote. */
export function Cite({ quote, page, check }: { quote: string; page: number | null; check?: Check }) {
  const [open, setOpen] = useState(false);
  if (!quote?.trim() && page === null) return null;
  const meta = CHECK_META[check ?? "none"];
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={meta.title || "Show source quote"}
        className="mt-1 inline-flex items-center gap-1.5 rounded-md text-[11px] text-slate-400 transition hover:text-white"
      >
        {page !== null && <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono">p.{page}</span>}
        {check && check !== "none" && (
          <Badge tone={meta.tone} className="px-1.5 py-0 text-[10px]">
            {check === "exact" || check === "page_corrected" ? <Icon name="check" size={10} /> : <Icon name="alert" size={10} />}
            {meta.label}
          </Badge>
        )}
      </button>
      {open && quote && (
        <span className="animate-fade-up mt-1.5 block max-w-md border-l-2 border-indigo-400/60 pl-2.5 text-xs italic leading-relaxed text-slate-300">
          “{quote}”
        </span>
      )}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  className,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-400 hover:to-violet-400",
        variant === "secondary" && "border border-white/10 bg-white/[0.04] text-slate-200 hover:border-white/20 hover:bg-white/[0.08]",
        variant === "ghost" && "text-slate-300 hover:bg-white/[0.06] hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function formatDate(iso: string | null, fallback: string) {
  if (!iso) return fallback;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", weekday: "short" });
}
