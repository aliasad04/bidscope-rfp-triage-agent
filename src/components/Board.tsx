"use client";

import { countdownLabel, daysUntil, proposalDue } from "@/lib/actions";
import type { SavedReport } from "@/lib/history";
import { Badge, Card, Icon, SectionTitle, cx, formatDate } from "./ui";

/** Every RFP analysed in this browser, ranked by fit, so the team sees which one deserves the week. */
export function Board({ items, onOpen, onRemove }: { items: SavedReport[]; onOpen: (s: SavedReport) => void; onRemove: (id: string) => void }) {
  if (items.length === 0) return null;
  const ranked = [...items].sort(
    (x, y) => Number(y.report.decision === "BID") - Number(x.report.decision === "BID") || y.report.fit_score - x.report.fit_score,
  );
  return (
    <Card delay={150}>
      <SectionTitle icon="chart" accent="violet" hint="Every RFP you've triaged in this browser, best opportunities first.">
        Triage board
      </SectionTitle>
      <ul className="space-y-2">
        {ranked.map((s, i) => {
          const r = s.report;
          const bid = r.decision === "BID";
          const due = proposalDue(r);
          const days = due?.date_iso ? daysUntil(due.date_iso) : null;
          return (
            <li key={s.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onOpen(s)}
                onKeyDown={(e) => e.key === "Enter" && onOpen(s)}
                className="group flex cursor-pointer items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 transition hover:border-indigo-400/30 hover:bg-indigo-500/[0.05]"
              >
                <span className="w-5 text-center font-mono text-xs text-slate-500">{i + 1}</span>
                <div
                  className={cx(
                    "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl ring-1 ring-inset",
                    bid ? "bg-emerald-500/10 ring-emerald-400/30" : "bg-rose-500/10 ring-rose-400/30",
                  )}
                >
                  <span className={cx("text-lg font-bold leading-none", bid ? "text-emerald-300" : "text-rose-300")}>{r.fit_score}</span>
                  <span className="text-[9px] text-slate-500">/10</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={bid ? "green" : "red"}>{bid ? "BID" : "NO BID"}</Badge>
                    <span className="truncate font-medium text-slate-100">{r.analysis.title}</span>
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-500">
                    {r.analysis.agency} · {r.analysis.work_category}
                  </div>
                </div>
                <div className="hidden shrink-0 text-right text-xs sm:block">
                  {due ? (
                    <>
                      <div className="text-slate-300">{formatDate(due.date_iso, due.as_written)}</div>
                      {days !== null && (
                        <div className={cx("mt-0.5", days < 0 ? "text-slate-500" : days <= 14 ? "text-amber-300" : "text-emerald-300")}>
                          {days < 0 ? "closed" : countdownLabel(days)}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="italic text-slate-500">Not stated</span>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(s.id);
                  }}
                  className="rounded-lg p-1.5 text-slate-600 opacity-0 transition hover:bg-rose-500/10 hover:text-rose-300 group-hover:opacity-100"
                  aria-label="Remove from board"
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
