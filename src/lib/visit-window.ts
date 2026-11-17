import type { AccessRequest } from "@/lib/api/types";

/**
 * Local wall-clock timestamp ("yyyy-MM-ddTHH:mm:ss", no zone) for the API.
 * The API stores times as UK local time; `toISOString()` is UTC and would
 * be stored an hour out during BST.
 */
export function localStamp(d: Date = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function ms(raw?: string | null) {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

/** Start of the approved time frame (WorkFrom). */
export function windowStart(req: AccessRequest) {
  return ms(req.workFrom);
}

/** End of the approved time frame: WorkTo, falling back to ExpectedClockOutAt. */
export function windowEnd(req: AccessRequest) {
  return ms(req.workTo) ?? ms(req.expectedClockOutAt);
}

/** True once the approved time frame is over. */
export function windowEnded(req: AccessRequest, now = Date.now()) {
  const end = windowEnd(req);
  return end != null && now > end;
}

export type VisitPhase = "Upcoming" | "Active" | "Overdue";

/**
 * Phase of an approved, not-yet-completed visit:
 * Upcoming before the time frame starts, Active inside it, Overdue once it has
 * ended without a clock out.
 */
export function visitPhase(req: AccessRequest, now = Date.now()): VisitPhase {
  if (windowEnded(req, now)) return "Overdue";
  if (req.clockedInAt) return "Active";
  const start = windowStart(req);
  if (start == null) return "Upcoming";
  return now >= start ? "Active" : "Upcoming";
}
