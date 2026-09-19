import {
  asArray,
  isPlainObject,
  num,
  pickNum,
  post,
} from "./client-http";
import {
  asRequestRow,
  asRoom,
  asWorkerRow,
  coerceRow,
  pickDate,
} from "./client-mappers";
import { readSession } from "@/lib/session";
import type {
  AccessRequest,
  ScanQrResult,
  User,
  Worker,
} from "./types";

export type ListFilter = {
  id?: number;
  workerId?: number;
  roomId?: number;
  siteId?: number;
  workAreaId?: number;
  accessRequestId?: number;
  approverUserId?: number;
  status?: string;
  search?: string;
  skip?: number;
  take?: number;
};

export type PagedList<T> = T[] & { total: number };

export function listFilterBody(token: string, filter?: ListFilter) {
  const body: Record<string, unknown> = { token };
  if (filter) {
    for (const [key, value] of Object.entries(filter)) {
      if (value == null || value === "" || value === "all") continue;
      if (typeof value === "number" && value === 0 && key !== "skip") continue;
      body[key] = value;
    }
  }
  return dual(body);
}

export function asPagedList<T>(
  raw: unknown,
  map: (row: unknown) => T,
  keep: (row: T) => boolean,
): PagedList<T> {
  const source = asArray<unknown>(raw);
  const rows = source.map(map).filter(keep) as PagedList<T>;
  rows.total = pickNum(coerceRow(source[0]), ["total"]) || rows.length;
  return rows;
}

export function dual(payload: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...payload };
  for (const [key, value] of Object.entries(payload)) {
    if (!key || key[0] !== key[0].toLowerCase()) continue;
    out[key.charAt(0).toUpperCase() + key.slice(1)] = value;
  }
  return out;
}

export async function resolveRoom(qrCodeIdentifier: string, raw: unknown): Promise<ScanQrResult> {
  const room = asRoom(raw);
  if (!room.qrCodeIdentifier) room.qrCodeIdentifier = qrCodeIdentifier;
  if (room.id) return room;

  const token = readSession()?.token;
  if (token) {
    try {
      const rooms = asArray<unknown>(await post("/Access/getrooms", { token })).map((row) =>
        asRoom(row),
      );
      const needle = qrCodeIdentifier.trim().toLowerCase();
      const match = rooms.find((r) => r.qrCodeIdentifier.toLowerCase() === needle);
      if (match?.id) {
        return { ...room, ...match, qrCodeIdentifier: match.qrCodeIdentifier || qrCodeIdentifier };
      }
    } catch {
      /* worker phones will not have a staff token */
    }
  }
  return room;
}

export function placeholderUser(email: string): User {
  return {
    id: 0,
    firstName: email.split("@")[0] || "Manager",
    lastName: "",
    email,
    phoneNumber: "",
    role: "Manager",
    isActive: true,
    createdAt: new Date().toISOString(),
  };
}

export function asWorker(
  data: unknown,
  fallback: { firstName?: string; lastName?: string; phoneNumber?: string; companyName?: string },
): Worker {
  if (typeof data === "number") {
    return {
      id: data,
      firstName: fallback.firstName ?? "",
      lastName: fallback.lastName ?? "",
      phoneNumber: fallback.phoneNumber ?? "",
      companyName: fallback.companyName ?? "",
      isActive: true,
      createdAt: new Date().toISOString(),
    };
  }
  if (isPlainObject(data) && data.id != null) return data as unknown as Worker;
  return {
    id: 0,
    firstName: fallback.firstName ?? "",
    lastName: fallback.lastName ?? "",
    phoneNumber: fallback.phoneNumber ?? "",
    companyName: fallback.companyName ?? "",
    isActive: true,
    createdAt: new Date().toISOString(),
  };
}

export function asRequest(
  data: unknown,
  fallback: {
    phoneNumber: string;
    workerId: number;
    roomId: number;
    reason: string;
    workType: string;
    description: string;
  },
): AccessRequest {
  if (typeof data === "number") {
    return {
      id: data,
      workerId: fallback.workerId,
      roomId: fallback.roomId,
      status: "Pending",
      reason: fallback.reason,
      workType: fallback.workType,
      description: fallback.description,
      phoneNumber: fallback.phoneNumber,
      approvedAt: null,
      rejectedAt: null,
      clockedInAt: null,
      expectedClockOutAt: null,
      clockedOutAt: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
    };
  }
  const row = coerceRow(data);
  const id = pickNum(row, ["id"]);
  const roomId = pickNum(row, ["roomId"]) || fallback.roomId;
  if (id) {
    const base = isPlainObject(data) ? (data as unknown as AccessRequest) : ({} as AccessRequest);
    return {
      ...base,
      id,
      workerId: num(base.workerId) || fallback.workerId,
      roomId,
      status: base.status || "Pending",
      reason: base.reason || fallback.reason,
      workType: base.workType || fallback.workType,
      description: base.description || fallback.description,
      phoneNumber: base.phoneNumber || fallback.phoneNumber,
      approvedAt: base.approvedAt ?? null,
      rejectedAt: base.rejectedAt ?? null,
      clockedInAt: base.clockedInAt ?? null,
      expectedClockOutAt: base.expectedClockOutAt ?? null,
      clockedOutAt: base.clockedOutAt ?? null,
      completedAt: base.completedAt ?? null,
      createdAt: base.createdAt || new Date().toISOString(),
    };
  }
  return {
    id: 0,
    workerId: fallback.workerId,
    roomId,
    status: "Pending",
    reason: fallback.reason,
    workType: fallback.workType,
    description: fallback.description,
    phoneNumber: fallback.phoneNumber,
    approvedAt: null,
    rejectedAt: null,
    clockedInAt: null,
    expectedClockOutAt: null,
    clockedOutAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
  };
}

export type LoginResult = { token: string; user: User };
