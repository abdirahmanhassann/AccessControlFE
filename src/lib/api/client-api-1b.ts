import { ApiError } from "./types";
import {
  asArray,
  isPlainObject,
  num,
  pickNum,
  pickStr,
  post,
} from "./client-http";
import {
  asRequestRow,
  asRoom,
  asWorkerRow,
  coerceRow,
} from "./client-mappers";
import {
  asPagedList,
  asRequest,
  dual,
  listFilterBody,
} from "./client-list";
import type { ListFilter } from "./client-list";
import type {
  AccessRequest,
  AccessWindow,
  Room,
  RoomManager,
  Worker,
} from "./types";

export const apiPart1b = {
  getWorkers: async (token: string) =>
    asArray<unknown>(await post("/Access/getworkers", { token }))
      .map((row) => asWorkerRow(row))
      .filter((row) => row.id),
  insertWorker: async (data: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    companyName?: string;
  }) => asWorkerRow(await post<unknown>("/Access/insertworker", data), data),
  updateWorker: (token: string, data: Worker) =>
    post<Worker | null>("/Access/updateworker", { token, ...data }),

  getRooms: async (token: string) =>
    asArray<unknown>(await post("/Access/getrooms", { token })).map((row) => asRoom(row)),
  insertRoom: (
    token: string,
    data: {
      workAreaId: number;
      roomNumber: string;
      name: string;
      description: string;
      locationKind?: string;
    },
  ) => post<Room | null>("/Access/insertroom", { token, ...data }),
  updateRoom: (token: string, data: Room) => post<Room | null>("/Access/updateroom", { token, ...data }),

  getRoomManagers: (token: string) =>
    post<RoomManager[]>("/Access/getroommanagers", { token }).then(asArray<RoomManager>),
  insertRoomManager: (token: string, data: { roomId: number; managerUserId: number; isPrimary?: boolean }) =>
    post("/Access/insertroommanager", dual({ token, ...data, isPrimary: data.isPrimary ?? true })),
  updateRoomManager: (
    token: string,
    data: { id: number; roomId: number; managerUserId: number; isPrimary?: boolean },
  ) => post("/Access/updateroommanager", dual({ token, ...data })),

  getAccessWindows: (token: string) =>
    post<AccessWindow[]>("/Access/getaccesswindows", { token }).then(asArray<AccessWindow>),
  insertAccessWindow: (token: string, data: Omit<AccessWindow, "id" | "isActive">) =>
    post<AccessWindow | null>("/Access/insertaccesswindow", { token, ...data }),
  updateAccessWindow: (token: string, data: AccessWindow) =>
    post<AccessWindow | null>("/Access/updateaccesswindow", { token, ...data }),

  getAccessRequests: async (token: string | undefined, filter?: ListFilter) =>
    asPagedList(
      await post("/Access/getaccessrequests", listFilterBody(token ?? "", filter)),
      (row) => asRequestRow(row),
      (row) => Boolean(row.id),
    ),
  insertAccessRequest: async (data: {
    phoneNumber: string;
    workerId: number;
    roomId?: number;
    workAreaId?: number;
    siteId?: number;
    roomText?: string;
    departmentId?: number;
    locationKind?: string;
    reason: string;
    workType: string;
    description: string;
    supervisorName?: string;
    workFrom?: string;
    workTo?: string;
    qrCodeIdentifier?: string;
    approverUserId?: number;
  }) => {
    const roomId = num(data.roomId);
    const workerId = num(data.workerId);
    const workAreaId = num(data.workAreaId);
    const siteId = num(data.siteId);
    const roomText = String(data.roomText ?? "").trim();
    if (!workAreaId && !siteId) {
      throw new ApiError(400, "Choose the site.");
    }
    if (!roomText && !roomId) {
      throw new ApiError(400, "Enter the room.");
    }
    const payload: Record<string, unknown> = {
      PhoneNumber: data.phoneNumber,
      WorkerId: workerId,
      WorkAreaId: workAreaId,
      SiteId: siteId,
      RoomText: roomText,
      RoomNumber: roomText,
      DepartmentId: num(data.departmentId),
      LocationKind: data.locationKind ?? "",
      Reason: data.reason,
      WorkType: data.workType,
      Description: data.description,
      SupervisorName: data.supervisorName ?? "",
      WorkFrom: data.workFrom || null,
      WorkTo: data.workTo || null,
    };
    if (roomId) payload.RoomId = roomId;
    if (data.qrCodeIdentifier) payload.QrCodeIdentifier = data.qrCodeIdentifier;
    const approverUserId = num(data.approverUserId);
    if (approverUserId) payload.ApproverUserId = approverUserId;
    const created = await post<unknown>("/Access/insertaccessrequest", payload);
    const resolvedRoomId = pickNum(coerceRow(created), ["roomId", "id"]) || roomId;
    return asRequest(created, {
      ...data,
      roomId: resolvedRoomId,
      workerId,
    });
  },
};
