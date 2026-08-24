import { useCallback, useEffect, useState } from "react";
import { api, asArray } from "@/lib/api/client";
import type {
  AccessPhoto,
  AccessRequest,
  AccessRequestApproval,
  AccessWindow,
  AuditEvent,
  Notification,
  Room,
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
};

function settled<T>(result: PromiseSettledResult<T[]>): T[] {
  return result.status === "fulfilled" ? asArray<T>(result.value) : [];
}

export function useStaffData(token: string | undefined) {
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
        api.getAccessRequests(token),
        api.getApprovals(token),
        api.getPhotos(token),
        api.getNotifications(token),
        api.getAudits(token),
        api.getAccessWindows(token),
        api.getWorkAreaManagers(token),
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

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}

export function roomLabel(data: StaffData | null, roomId: number) {
  const room = data?.rooms.find((r) => r.id === roomId);
  if (!room) return `Room #${roomId}`;
  const area = data?.areas.find((a) => a.id === room.workAreaId);
  const site = area ? data?.sites.find((s) => s.id === area.siteId) : undefined;
  return `${room.roomNumber} · ${room.name}${site ? ` · ${site.name}` : ""}`;
}

export function workerLabel(data: StaffData | null, workerId: number) {
  const w = data?.workers.find((x) => x.id === workerId);
  return w ? `${w.firstName} ${w.lastName}` : `Worker #${workerId}`;
}

export function userLabel(data: StaffData | null, userId: number) {
  const u = data?.users.find((x) => x.id === userId);
  return u ? `${u.firstName} ${u.lastName}` : `User #${userId}`;
}

export function areaLabel(data: StaffData | null, areaId: number) {
  const a = data?.areas.find((x) => x.id === areaId);
  return a?.name ?? `Area #${areaId}`;
}

export function siteLabel(data: StaffData | null, siteId: number) {
  const s = data?.sites.find((x) => x.id === siteId);
  return s?.name ?? `Site #${siteId}`;
}
