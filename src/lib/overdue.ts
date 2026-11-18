/**
 * When a visit counts as overdue, and the status a list should show for it.
 *
 * Kept apart from staff-data so it imports nothing but types: the rule is the
 * one piece of this app's logic worth unit testing on its own, and the test
 * runner has no bundler to resolve the "@/" alias with.
 */
import type { AccessRequest, AccessRequestApproval } from "./api/types";

type RequestList = {
  requests: AccessRequest[];
  approvals: AccessRequestApproval[];
};

export function effectiveStatus(req: AccessRequest, approvals: AccessRequestApproval[]) {
  const mine = approvals
    .filter((a) => a.accessRequestId === req.id)
    .sort((a, b) => String(b.reviewedAt || b.createdAt).localeCompare(String(a.reviewedAt || a.createdAt)));
  const decided = mine.find((a) => /^(approved|rejected|cancelled)$/i.test(String(a.status)));
  if (decided) return decided.status;
  if (req.status && !/^pending$/i.test(String(req.status))) return req.status;
  return mine[0]?.status || req.status || "Pending";
}

export function dueClockOutAt(req: AccessRequest): string | null {
  const raw = req.workTo || req.expectedClockOutAt || null;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? raw : null;
}

/**
 * An approved visit whose time frame has ended and that nobody has closed —
 * whether or not the worker ever clocked in.
 *
 * Both halves need a manager: one has someone on site past their time, the
 * other is a booking nobody turned up for, and neither can be closed by the
 * worker (the API refuses a late clock-out).
 */
export function isOverdueVisit(req: AccessRequest, approvals: AccessRequestApproval[] = []) {
  if (req.clockedOutAt || req.completedAt) return false;
  const dueRaw = dueClockOutAt(req);
  if (!dueRaw) return false;
  const status = effectiveStatus(req, approvals);
  if (!/^approved$/i.test(String(status))) return false;
  const due = Date.parse(dueRaw);
  return Number.isFinite(due) && due < Date.now();
}

/** The narrower case: overdue *and* the worker is still on site. */
export function isOverdueClockOut(req: AccessRequest, approvals: AccessRequestApproval[] = []) {
  return Boolean(req.clockedInAt) && isOverdueVisit(req, approvals);
}

export function overdueVisits(data: RequestList | null) {
  if (!data) return [];
  return data.requests
    .filter((r) => isOverdueVisit(r, data.approvals))
    .sort((a, b) => {
      const da = dueClockOutAt(a) || "";
      const db = dueClockOutAt(b) || "";
      return da.localeCompare(db);
    });
}

export function overdueClockOuts(data: RequestList | null) {
  if (!data) return [];
  return data.requests
    .filter((r) => isOverdueClockOut(r, data.approvals))
    .sort((a, b) => {
      const da = dueClockOutAt(a) || "";
      const db = dueClockOutAt(b) || "";
      return da.localeCompare(db);
    });
}
