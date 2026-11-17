import { useCallback, useEffect, useState } from "react";
import { visitPhase } from "@/lib/visit-window";
import { locationDisplay } from "@/lib/location";
import { api, asArray } from "@/lib/api/client";
import type {
  AccessPhoto,
  AccessRequest,
  AccessRequestApproval,
  AccessWindow,
  AuditEvent,
  Notification,
  Room,
  RoomManager,
  Site,
  User,
  WorkArea,
  WorkAreaManager,
  Worker,
} from "@/lib/api/types";

export type StaffData = {
  sites: Site[];
  areas: WorkArea[];
  rooms: Room[];
  workers: Worker[];
  users: User[];
  requests: AccessRequest[];
  approvals: AccessRequestApproval[];
  photos: AccessPhoto[];
  notes: Notification[];
  audits: AuditEvent[];
  windows: AccessWindow[];
  managers: WorkAreaManager[];
  roomManagers: RoomManager[];
};

const EMPTY: StaffData = {
  sites: [],
  areas: [],
  rooms: [],
  workers: [],
  users: [],
  requests: [],
  approvals: [],
  photos: [],
  notes: [],
  audits: [],
  windows: [],
  managers: [],
  roomManagers: [],
};

function settled<T>(result: PromiseSettledResult<T[]>): T[] {
  return result.status === "fulfilled" ? asArray<T>(result.value) : [];
}

export function useStaffData(token: string | undefined, options?: { pollRequests?: boolean }) {
  const [data, setData] = useState<StaffData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const results = await Promise.allSettled([
        api.getSites(token),
        api.getWorkAreas(token),
        api.getRooms(token),
        api.getWorkers(token),
        api.getUsers(token),
        api.getAccessRequests(token, { take: 200 }),
        api.getApprovals(token, { take: 100 }),
        api.getPhotos(token),
        api.getNotifications(token),
        api.getAudits(token),
        api.getAccessWindows(token),
        api.getWorkAreaManagers(token),
        api.getRoomManagers(token).catch(() => [] as RoomManager[]),
      ]);
      const next: StaffData = {
        sites: settled(results[0]),
        areas: settled(results[1]),
        rooms: settled(results[2]),
        workers: settled(results[3]),
        users: settled(results[4]),
        requests: settled(results[5]),
        approvals: settled(results[6]),
        photos: settled(results[7]),
        notes: settled(results[8]),
        audits: settled(results[9]),
        windows: settled(results[10]),
        managers: settled(results[11]),
        roomManagers: settled(results[12]),
      };
      const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      if (failed.length === results.length) {
        const reason = failed[0]?.reason;
        setError(reason instanceof Error ? reason.message : "Could not load data");
        setData(EMPTY);
      } else {
        if (failed.length) {
          const reason = failed[0]?.reason;
          setError(
            reason instanceof Error
              ? `${failed.length} lists failed: ${reason.message}`
              : `${failed.length} lists failed to load`,
          );
        }
        setData(next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load data");
      setData(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const refreshRequests = useCallback(async () => {
    if (!token) return;
    try {
      const requests = await api.getAccessRequests(token, { take: 200 });
      setData((prev) => (prev ? { ...prev, requests } : prev));
    } catch {
      /* keep last list; polling should not surface a flash error */
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!token || !options?.pollRequests) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refreshRequests();
    };
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [token, options?.pollRequests, refreshRequests]);

  return { data, error, loading, reload };
}

export function roomLabel(data: StaffData | null, roomId: number) {
  const room = data?.rooms.find((r) => r.id === roomId);
  if (!room) return `Location #${roomId}`;
  const area = data?.areas.find((a) => a.id === room.workAreaId);
  const site = area ? data?.sites.find((s) => s.id === area.siteId) : undefined;
  return `${locationDisplay(room)}${area ? ` · ${area.name}` : ""}${site ? ` · ${site.name}` : ""}`;
}

export function workerLabel(data: StaffData | null, workerId: number, fallback?: AccessRequest | AccessRequestApproval | null) {
  const w = data?.workers.find((x) => x.id === workerId);
  if (w) return `${w.firstName} ${w.lastName}`.trim();
  const fromJoin = approvalWorkerName(fallback);
  if (fromJoin) return fromJoin;
  return workerId ? `Worker #${workerId}` : "Unknown worker";
}

export function userLabel(data: StaffData | null, userId: number, fallback?: AccessRequestApproval | null) {
  const u = data?.users.find((x) => x.id === userId);
  if (u) return `${u.firstName} ${u.lastName}`.trim();
  const fromJoin = approvalApproverName(fallback);
  if (fromJoin) return fromJoin;
  return userId ? `Staff #${userId}` : "Unknown staff";
}

export function approvalWorkerName(row?: AccessRequest | AccessRequestApproval | null) {
  if (!row) return "";
  return [row.workerFirstName, row.workerLastName].filter(Boolean).join(" ").trim();
}

export function approvalApproverName(row?: AccessRequestApproval | null) {
  if (!row) return "";
  return [row.approverFirstName, row.approverLastName].filter(Boolean).join(" ").trim();
}

export function latestApproval(data: StaffData | null, accessRequestId: number) {
  return (data?.approvals ?? [])
    .filter((a) => a.accessRequestId === accessRequestId)
    .sort((a, b) => String(b.reviewedAt || b.createdAt).localeCompare(String(a.reviewedAt || a.createdAt)))[0];
}

export function effectiveStatus(req: AccessRequest, approvals: AccessRequestApproval[]) {
  const mine = approvals
    .filter((a) => a.accessRequestId === req.id)
    .sort((a, b) => String(b.reviewedAt || b.createdAt).localeCompare(String(a.reviewedAt || a.createdAt)));
  const decided = mine.find((a) => /^(approved|rejected|cancelled)$/i.test(String(a.status)));
  if (decided) return decided.status;
  if (req.status && !/^pending$/i.test(String(req.status))) return req.status;
  return mine[0]?.status || req.status || "Pending";
}

/**
 * Status shown to managers. "Approved" is split by the approved time frame:
 * Upcoming = before it starts; Active = inside it; Overdue = it has ended and the
 * worker has not clocked out; Completed = clocked out.
 */
export function displayStatus(req: AccessRequest, approvals: AccessRequestApproval[]) {
  const status = String(effectiveStatus(req, approvals));
  if (!/^approved$/i.test(status)) return status;
  if (req.clockedOutAt || req.completedAt) return "Completed";
  return visitPhase(req);
}

/** Statuses the API does not store; the requests page derives them from Approved rows. */
export const DERIVED_STATUSES = ["Upcoming", "Active", "Overdue"];

export function workerForApproval(data: StaffData | null, approval: AccessRequestApproval) {
  const req = data?.requests.find((r) => r.id === approval.accessRequestId);
  if (req) return workerLabel(data, req.workerId, req);
  return approvalWorkerName(approval) || `Request #${approval.accessRequestId}`;
}

export function isUnreviewed(a: AccessRequestApproval) {
  if (/^(approved|rejected|cancelled)$/i.test(String(a.status)) && a.reviewedAt) return false;
  return true;
}

export function pendingRequests(data: StaffData | null) {
  if (!data) return [];
  return data.requests.filter((r) => /^pending$/i.test(effectiveStatus(r, data.approvals)));
}

/** Planned leave time: prefer WorkTo (what the worker entered), then ExpectedClockOutAt. */
export function dueClockOutAt(req: AccessRequest): string | null {
  const raw = req.workTo || req.expectedClockOutAt || null;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? raw : null;
}

export function isOverdueClockOut(req: AccessRequest, approvals: AccessRequestApproval[] = []) {
  if (req.clockedOutAt || req.completedAt) return false;
  if (!req.clockedInAt) return false;
  const dueRaw = dueClockOutAt(req);
  if (!dueRaw) return false;
  const status = effectiveStatus(req, approvals);
  if (!/^approved$/i.test(String(status))) return false;
  const due = Date.parse(dueRaw);
  return Number.isFinite(due) && due < Date.now();
}

export function overdueClockOuts(data: StaffData | null) {
  if (!data) return [];
  return data.requests
    .filter((r) => isOverdueClockOut(r, data.approvals))
    .sort((a, b) => {
      const da = dueClockOutAt(a) || "";
      const db = dueClockOutAt(b) || "";
      return da.localeCompare(db);
    });
}

export function isStaffRole(role?: string | null) {
  const r = String(role ?? "").toLowerCase();
  return r === "admin" || r === "sitemanager" || r === "manager" || r === "keyman" || r === "viewer";
}

/** Roles with manager-level access: they can be mapped to locations and approve requests. */
export function isManagerRole(role?: string | null) {
  return /^(admin|sitemanager|manager|keyman)$/i.test(String(role ?? "").trim());
}

/** Who signs off a room after the worker leaves: the Keyman, or an Admin standing in. */
export function canReviewRoomLeave(role?: string | null) {
  return /^(keyman|admin)$/i.test(String(role ?? "").trim());
}

/** Start and end of a visit as the Keyman sees it: the approved time frame, else the clock times. */
export function visitSpan(req: AccessRequest) {
  return {
    start: req.workFrom || req.clockedInAt || null,
    end: req.workTo || req.expectedClockOutAt || null,
  };
}

/**
 * Approved visits the worker has not signed out of yet — upcoming, on site or
 * overdue — ordered by when they start.
 */
export function activeRequests(data: Pick<StaffData, "requests" | "approvals"> | null) {
  if (!data) return [];
  return data.requests
    .filter((r) => /^approved$/i.test(String(effectiveStatus(r, data.approvals))))
    .filter((r) => !r.clockedOutAt && !r.completedAt)
    .sort((a, b) => String(visitSpan(a).start || "").localeCompare(String(visitSpan(b).start || "")));
}

export function areaLabel(data: StaffData | null, areaId: number) {
  const a = data?.areas.find((x) => x.id === areaId);
  return a?.name ?? `Area #${areaId}`;
}

export function siteLabel(data: StaffData | null, siteId: number) {
  const s = data?.sites.find((x) => x.id === siteId);
  return s?.name ?? `Site #${siteId}`;
}
