// Multi-room access requests and keys.
import { asArray, isPlainObject, num, pickNum, pickStr, post } from "./client-http";
import { coerceRow } from "./client-mappers";
import { dual } from "./client-list";
import type {
  AccessRequestKey,
  BlackoutWindow,
  GroupRoom,
  GroupRoomInput,
  GroupSubmitResult,
  RequestGroup,
  RoomCheck,
  RoomKey,
} from "./types";

const str = (row: Record<string, unknown>, key: string) => pickStr(row, [key]);
const date = (row: Record<string, unknown>, key: string) => pickStr(row, [key]) || null;

function asWindows(value: unknown): BlackoutWindow[] {
  return asArray<unknown>(value).map((w) => {
    const row = coerceRow(w);
    return { start: str(row, "start"), end: str(row, "end"), active: row.active === true };
  });
}

export function asGroupRoom(data: unknown): GroupRoom {
  const row = coerceRow(data);
  return {
    groupId: pickNum(row, ["groupId"]),
    accessRequestId: pickNum(row, ["accessRequestId"]),
    workerId: pickNum(row, ["workerId"]),
    workerFirstName: str(row, "workerFirstName"),
    workerLastName: str(row, "workerLastName"),
    workerPhoneNumber: str(row, "workerPhoneNumber"),
    roomId: pickNum(row, ["roomId"]),
    roomNumber: str(row, "roomNumber"),
    roomName: str(row, "roomName"),
    workAreaId: pickNum(row, ["workAreaId"]),
    workAreaName: str(row, "workAreaName"),
    status: str(row, "status") || "Pending",
    reason: str(row, "reason"),
    workType: str(row, "workType"),
    description: str(row, "description"),
    supervisorName: str(row, "supervisorName"),
    workFrom: date(row, "workFrom"),
    workTo: date(row, "workTo"),
    approvedAt: date(row, "approvedAt"),
    rejectedAt: date(row, "rejectedAt"),
    clockedInAt: date(row, "clockedInAt"),
    clockedOutAt: date(row, "clockedOutAt"),
    completedAt: date(row, "completedAt"),
    approvalId: pickNum(row, ["approvalId"]),
    approverUserId: pickNum(row, ["approverUserId"]),
    approvalStatus: str(row, "approvalStatus") || "Pending",
    comment: str(row, "comment"),
    keyCount: pickNum(row, ["keyCount"]),
  };
}

export function asRoomKey(data: unknown): RoomKey {
  const row = coerceRow(data);
  return {
    id: pickNum(row, ["id"]),
    roomId: pickNum(row, ["roomId"]),
    label: str(row, "label"),
    tagNumber: str(row, "tagNumber"),
    notes: str(row, "notes"),
    isActive: row.isActive !== false,
    roomNumber: str(row, "roomNumber"),
    roomName: str(row, "roomName"),
    workAreaId: pickNum(row, ["workAreaId"]),
    workAreaName: str(row, "workAreaName"),
    siteId: pickNum(row, ["siteId"]),
    available: row.available !== false,
    heldBy: str(row, "heldBy"),
  };
}

export function asAccessRequestKey(data: unknown): AccessRequestKey {
  const row = coerceRow(data);
  return {
    id: pickNum(row, ["id"]),
    accessRequestId: pickNum(row, ["accessRequestId"]),
    groupId: pickNum(row, ["groupId"]),
    keyId: pickNum(row, ["keyId"]),
    keyLabel: str(row, "keyLabel"),
    tagNumber: str(row, "tagNumber"),
    status: str(row, "status") || "Requested",
    returnBy: date(row, "returnBy"),
    issuedAt: date(row, "issuedAt"),
    returnedAt: date(row, "returnedAt"),
    note: str(row, "note"),
    workerId: pickNum(row, ["workerId"]),
    workerFirstName: str(row, "workerFirstName"),
    workerLastName: str(row, "workerLastName"),
    workerPhoneNumber: str(row, "workerPhoneNumber"),
    companyName: str(row, "companyName"),
    roomId: pickNum(row, ["roomId"]),
    roomNumber: str(row, "roomNumber"),
    roomName: str(row, "roomName"),
    workAreaName: str(row, "workAreaName"),
    requestStatus: str(row, "requestStatus"),
    workFrom: date(row, "workFrom"),
    workTo: date(row, "workTo"),
    clockedInAt: date(row, "clockedInAt"),
    clockedOutAt: date(row, "clockedOutAt"),
  };
}

function asRoomCheck(data: unknown): RoomCheck {
  const row = coerceRow(data);
  return {
    roomId: pickNum(row, ["roomId"]),
    workAreaId: pickNum(row, ["workAreaId"]),
    workAreaName: str(row, "workAreaName"),
    label: str(row, "label"),
    blocked: row.blocked === true,
    message: str(row, "message"),
    windows: asWindows(row.windows),
  };
}

function roomBody(rooms: GroupRoomInput[]) {
  return rooms.map((r) =>
    dual({
      roomId: num(r.roomId),
      workAreaId: num(r.workAreaId),
      roomText: r.roomText,
      locationKind: r.locationKind ?? "",
      keyIds: (r.keyIds ?? []).filter((k) => k > 0),
      keyLabels: (r.keyLabels ?? []).map((k) => k.trim()).filter(Boolean),
    }),
  );
}

export const apiPart3 = {
  /** Which of these rooms are in blackout hours right now, with each room's hours for today. */
  checkRequestRooms: async (siteId: number, rooms: GroupRoomInput[]): Promise<RoomCheck[]> => {
    const data = await post<unknown>("/Access/checkrequestrooms", dual({ siteId, rooms: roomBody(rooms) }));
    const row = isPlainObject(data) ? data : {};
    return asArray<unknown>(row.rooms ?? data).map(asRoomCheck);
  },

  /** One submission for one or more rooms (and their keys). Blacked-out rooms come back in `skipped`. */
  insertAccessRequestGroup: async (data: {
    phoneNumber: string;
    workerId: number;
    siteId: number;
    departmentId: number;
    rooms: GroupRoomInput[];
    reason: string;
    workType: string;
    description: string;
    supervisorName: string;
    workFrom: string;
    workTo: string;
    approverUserId: number;
  }): Promise<GroupSubmitResult> => {
    const result = await post<unknown>(
      "/Access/insertaccessrequestgroup",
      dual({ ...data, rooms: roomBody(data.rooms) }),
    );
    const row = isPlainObject(result) ? result : {};
    return {
      groupId: pickNum(row, ["groupId"]),
      requests: asArray<unknown>(row.requests).map((r) => {
        const x = coerceRow(r);
        return { id: pickNum(x, ["id"]), roomId: pickNum(x, ["roomId"]), label: str(x, "label") };
      }),
      skipped: asArray<unknown>(row.skipped).map((r) => {
        const x = coerceRow(r);
        return {
          roomId: pickNum(x, ["roomId"]),
          label: str(x, "label"),
          message: str(x, "message"),
          windows: asWindows(x.windows),
        };
      }),
    };
  },

  /** Every room of a group with its approval, plus the keys asked for. Workers pass their workerId. */
  getAccessRequestGroup: async (
    token: string | undefined,
    groupId: number,
    workerId?: number,
  ): Promise<RequestGroup> => {
    const data = await post<unknown>(
      "/Access/getaccessrequestgroup",
      dual({ token: token ?? "", groupId, workerId: workerId ?? 0 }),
    );
    const row = isPlainObject(data) ? data : {};
    return {
      groupId: pickNum(row, ["groupId"]) || groupId,
      rooms: asArray<unknown>(row.rooms).map(asGroupRoom).filter((r) => r.accessRequestId),
      keys: asArray<unknown>(row.keys).map(asAccessRequestKey).filter((k) => k.id),
    };
  },

  /** Keys by room, work area or site. With workFrom/workTo, `available` says whether each is free then. */
  getKeys: async (filter: {
    token?: string;
    id?: number;
    roomId?: number;
    workAreaId?: number;
    siteId?: number;
    includeInactive?: boolean;
    workFrom?: string;
    workTo?: string;
  }): Promise<RoomKey[]> =>
    asArray<unknown>(
      await post(
        "/Access/getkeys",
        dual({
          token: filter.token ?? "",
          id: filter.id ?? 0,
          roomId: filter.roomId ?? 0,
          workAreaId: filter.workAreaId ?? 0,
          siteId: filter.siteId ?? 0,
          includeInactive: Boolean(filter.includeInactive),
          workFrom: filter.workFrom || null,
          workTo: filter.workTo || null,
        }),
      ),
    )
      .map(asRoomKey)
      .filter((k) => k.id),

  insertKey: (token: string, data: { roomId: number; label: string; tagNumber?: string; notes?: string }) =>
    post<unknown>(
      "/Access/insertkey",
      dual({ token, roomId: data.roomId, label: data.label, tagNumber: data.tagNumber ?? "", notes: data.notes ?? "" }),
    ),

  updateKey: (
    token: string,
    data: { id: number; label: string; tagNumber?: string; notes?: string; isActive: boolean },
  ) =>
    post<unknown>(
      "/Access/updatekey",
      dual({
        token,
        id: data.id,
        label: data.label,
        tagNumber: data.tagNumber ?? "",
        notes: data.notes ?? "",
        isActive: data.isActive,
      }),
    ),

  /** Keys on requests. `outstanding` lists keys still to hand out, still out, or missing. */
  getAccessRequestKeys: async (
    token: string,
    filter: { id?: number; accessRequestId?: number; groupId?: number; status?: string; outstanding?: boolean },
  ): Promise<AccessRequestKey[]> =>
    asArray<unknown>(
      await post(
        "/Access/getaccessrequestkeys",
        dual({
          token,
          id: filter.id ?? 0,
          accessRequestId: filter.accessRequestId ?? 0,
          groupId: filter.groupId ?? 0,
          status: filter.status ?? "",
          outstanding: Boolean(filter.outstanding),
        }),
      ),
    )
      .map(asAccessRequestKey)
      .filter((k) => k.id),

  /** Keyman: hand a key over, take it back, or record it missing. */
  updateAccessRequestKey: (token: string, data: { id: number; status: "Issued" | "Returned" | "Missing"; note?: string }) =>
    post<unknown>("/Access/updateaccessrequestkey", dual({ token, id: data.id, status: data.status, note: data.note ?? "" })),
};
