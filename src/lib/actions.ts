import type { Report } from "./report";

/** Whole days from today (local time) to an ISO date; negative when past. */
export function daysUntil(dateIso: string, now = new Date()): number {
  const [y, m, d] = dateIso.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function countdownLabel(days: number): string {
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} ago`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export function proposalDue(report: Report) {
  return report.analysis.key_dates.find((d) => d.category === "proposal_due" && d.status !== "superseded" && d.date_iso);
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/**
 * Calendar file with every current, dated deadline. Events are all-day with
 * the exact time in the title, which avoids guessing the timezone, plus a
 * reminder two days ahead.
 */
export function buildIcs(report: Report): string {
  const a = report.analysis;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const ref = a.solicitation_number !== "Not stated" ? a.solicitation_number : a.title;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BidScope//RFP Triage Agent//EN", "CALSCALE:GREGORIAN"];

  a.key_dates
    .filter((d) => d.date_iso && d.status !== "superseded")
    .forEach((d, i) => {
      const start = d.date_iso!.replace(/-/g, "");
      const next = new Date(`${d.date_iso}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const end = next.toISOString().slice(0, 10).replace(/-/g, "");
      const title = `${d.mandatory ? "[MANDATORY] " : ""}${d.event}${d.time ? ` – ${d.time}` : ""} (${ref})`;
      const desc = [d.note, d.quote && `"${d.quote}"`, d.page && `RFP page ${d.page}`].filter(Boolean).join("\n");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${start}-${i}-${ref.replace(/[^A-Za-z0-9]/g, "")}@bidscope`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${icsEscape(title)}`,
        `DESCRIPTION:${icsEscape(desc)}`,
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "TRIGGER:-P2D",
        `DESCRIPTION:${icsEscape(title)}`,
        "END:VALARM",
        "END:VEVENT",
      );
    });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/** Draft of the clarification email, built only from the report's questions and ambiguities. */
export function buildQuestionsEmail(report: Report): { to: string; subject: string; body: string } {
  const a = report.analysis;
  const ref = a.solicitation_number !== "Not stated" ? `RFP No. ${a.solicitation_number}` : a.title;
  const questions = [
    ...a.open_questions,
    ...a.ambiguities.map((x) => `${x.issue}${x.page ? ` (page ${x.page})` : ""} – please confirm which reading applies.`),
  ];
  const qDeadline = a.key_dates.find((d) => d.category === "questions_due" && d.status !== "superseded");
  const body = [
    `Dear ${a.procurement_contact.name !== "Not stated" ? a.procurement_contact.name : "Procurement Office"},`,
    "",
    `We are reviewing ${ref} (${a.title}) and respectfully submit the following questions${qDeadline ? `, ahead of the ${qDeadline.as_written} deadline` : ""}:`,
    "",
    ...questions.map((q, i) => `${i + 1}. ${q}`),
    "",
    "Thank you for your time.",
    "",
    "Kind regards,",
    "[Name]",
    "[Title], [Company]",
    "[Phone] · [Email]",
  ].join("\n");
  const to = a.procurement_contact.email !== "Not stated" ? a.procurement_contact.email : "";
  return { to, subject: `${ref} Questions`, body };
}

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

export function slug(s: string): string {
  return s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "rfp";
}
