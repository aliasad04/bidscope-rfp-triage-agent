"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_PROFILE, MAX_PROFILE_CHARS, PROFILE_HINT } from "@/lib/profile";
import { Button, IconTile } from "./ui";

export function ProfileDialog({
  open,
  profile,
  onClose,
  onSave,
}: {
  open: boolean;
  profile: string;
  onClose: () => void;
  onSave: (profile: string | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(profile);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setDraft(profile);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open, profile]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(720px,calc(100vw-32px))] rounded-2xl border border-white/10 bg-slate-900 p-0 text-slate-200 shadow-2xl shadow-black/60 backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <div className="flex items-start gap-3">
          <IconTile name="briefcase" accent="violet" />
          <div>
            <h2 className="text-lg font-semibold text-white">Company profile</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              The fit score and the &ldquo;We meet / Gap / Verify&rdquo; checks are judged against this text. It starts as the idiaz.io profile from
              the brief. {PROFILE_HINT}
            </p>
          </div>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_PROFILE_CHARS}
          rows={15}
          className="mt-5 w-full rounded-xl border border-white/10 bg-slate-950/70 p-4 font-mono text-[13px] leading-relaxed text-slate-200 outline-none transition focus:border-indigo-400/60 focus:ring-4 focus:ring-indigo-500/15"
        />
        <div className="mt-1 text-right text-xs text-slate-500">
          {draft.length} / {MAX_PROFILE_CHARS} · saved in this browser only
        </div>
        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <Button variant="ghost" onClick={() => setDraft(DEFAULT_PROFILE)}>
            Reset to idiaz.io default
          </Button>
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                onSave(draft.trim() === DEFAULT_PROFILE.trim() ? null : draft);
                onClose();
              }}
            >
              Save profile
            </Button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
