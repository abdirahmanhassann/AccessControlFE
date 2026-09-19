import {
  asArray,
  decode,
  isPlainObject,
  num,
  pickNum,
  pickStr,
} from "./client-http";
import type {
  AccessRequest,
  AccessRequestApproval,
  AuditEvent,
  Department,
  ScanQrResult,
  Site,
  User,
  WorkArea,
  Worker,
} from "./types";

export function coerceRow(data: unknown): Record<string, unknown> {
  if (typeof data === "number" && Number.isFinite(data)) return { id: data };
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed) return {};
    const asNum = Number(trimmed);
    if (Number.isFinite(asNum) && trimmed !== "") return { id: asNum };
    const parsed = decode(trimmed);
    if (parsed !== trimmed) return coerceRow(parsed);
    return { qrCodeIdentifier: trimmed };
  }
  if (Array.isArray(data)) return coerceRow(data[0]);
  if (!isPlainObject(data)) return {};
  const nested =
    data.room ?? data.Room ?? data.row ?? data.Row ?? data.data ?? data.Data;
  if (nested && nested !== data && (Array.isArray(nested) || isPlainObject(nested))) {
    return { ...data, ...coerceRow(nested) };
  }
  const rows = asArray(data);
  if (rows.length && rows[0] !== data && isPlainObject(rows[0])) {
    return { ...data, ...rows[0] };
  }
  return data;
}

export function asRoom(data: unknown): ScanQrResult {
  const row = coerceRow(data);
  const id = pickNum(row, ["id", "roomId", "roomID", "pk"]);
  return {
    id,
    workAreaId: pickNum(row, ["workAreaId", "workareaid"]),
    roomNumber: pickStr(row, ["roomNumber", "number", "roomNo"]),
    name: pickStr(row, ["name", "roomName"]),
    qrCodeIdentifier: pickStr(row, ["qrCodeIdentifier", "qr", "qrCode"]),
    description: pickStr(row, ["description"]),
    isActive: row.isActive !== false && row.IsActive !== false,
    workAreaName: pickStr(row, ["workAreaName"]),
    siteName: pickStr(row, ["siteName"]),
    siteId: pickNum(row, ["siteId"]),
    siteAddress: pickStr(row, ["siteAddress"]),
    locationKind: pickStr(row, ["locationKind"]) || undefined,
    scanKind: pickStr(row, ["scanKind"]) === "site" ? "site" : id ? "room" : "site",
  };
}

export function asAudit(data: unknown): AuditEvent {
  const row = coerceRow(data);
  return {
    id: pickNum(row, ["id"]),
    accessRequestId: pickNum(row, ["accessRequestId"]) || null,
    workerId: pickNum(row, ["workerId"]) || null,
    userId: pickNum(row, ["userId"]) || null,
    eventType: pickStr(row, ["eventType"]),
    description: pickStr(row, ["description"]),
    ipAddress: pickStr(row, ["ipAddress"]),
    metadata: pickStr(row, ["metadata"]),
    createdAt: pickStr(row, ["createdAt"]) || pickDate(row, ["createdAt"]) || "",
  };
}

export function asUserRow(data: unknown): User {
  const row = coerceRow(data);
  return {
    id: pickNum(row, ["id", "userId"]),
    firstName: pickStr(row, ["firstName"]),
    lastName: pickStr(row, ["lastName"]),
    email: pickStr(row, ["email"]),
    phoneNumber: pickStr(row, ["phoneNumber"]),
    role: pickStr(row, ["role"]) || "Manager",
    isActive: row.isActive !== false && row.IsActive !== false,
    createdAt: pickStr(row, ["createdAt"]) || new Date().toISOString(),
    departmentId: pickNum(row, ["departmentId"]) || undefined,
    departmentName: pickStr(row, ["departmentName"]) || undefined,
  };
}

export function asDepartment(data: unknown): Department {
  const row = coerceRow(data);
  return {
    id: pickNum(row, ["id", "departmentId"]),
    siteId: pickNum(row, ["siteId"]),
    name: pickStr(row, ["name", "departmentName"]),
    description: pickStr(row, ["description"]),
    isActive: row.isActive !== false && row.IsActive !== false,
    siteName: pickStr(row, ["siteName"]),
  };
}

export function asWorkArea(data: unknown): WorkArea {
  const row = coerceRow(data);
  return {
    id: pickNum(row, ["id", "workAreaId"]),
    siteId: pickNum(row, ["siteId"]),
    name: pickStr(row, ["name", "workAreaName"]),
    description: pickStr(row, ["description"]),
    isActive: row.isActive !== false && row.IsActive !== false,
    siteName: pickStr(row, ["siteName"]) || undefined,
  };
}

export function asSite(data: unknown): Site {
  const row = coerceRow(data);
  return {
    id: pickNum(row, ["id", "siteId"]),
    name: pickStr(row, ["name", "siteName"]),
    address: pickStr(row, ["address", "siteAddress"]),
    reference: pickStr(row, ["reference"]),
    isActive: row.isActive !== false && row.IsActive !== false,
    qrCodeIdentifier: pickStr(row, ["qrCodeIdentifier"]) || undefined,
  };
}

export function asWorkerRow(
  data: unknown,
  fallback?: { firstName?: string; lastName?: string; phoneNumber?: string; companyName?: string },
): Worker {
  const row = coerceRow(data);
  const id = typeof data === "number" ? data : pickNum(row, ["id", "workerId"]);
  return {
    id,
    firstName: pickStr(row, ["firstName"]) || fallback?.firstName || "",
    lastName: pickStr(row, ["lastName"]) || fallback?.lastName || "",
    phoneNumber: pickStr(row, ["phoneNumber"]) || fallback?.phoneNumber || "",
    companyName: pickStr(row, ["companyName"]) || fallback?.companyName || "",
    isActive: row.isActive !== false && row.IsActive !== false,
    createdAt: pickStr(row, ["createdAt"]) || new Date().toISOString(),
  };
}

export function asRequestRow(data: unknown): AccessRequest {
  const row = coerceRow(data);
  const status = pickStr(row, ["status"]) || "Pending";
  return {
    id: pickNum(row, ["id"]),
    workerId: pickNum(row, ["workerId"]),
    roomId: pickNum(row, ["roomId"]),
    status,
    reason: pickStr(row, ["reason"]),
    workType: pickStr(row, ["workType"]),
    description: pickStr(row, ["description"]),
    phoneNumber: pickStr(row, ["phoneNumber", "workerPhoneNumber"]),
    supervisorName: pickStr(row, ["supervisorName"]),
    workFrom: pickStr(row, ["workFrom"]) || null,
    workTo: pickStr(row, ["workTo"]) || null,
    towerName: pickStr(row, ["towerName"]),
    locationLabel: pickStr(row, ["locationLabel"]),
    approvedAt: pickStr(row, ["approvedAt"]) || null,
    rejectedAt: pickStr(row, ["rejectedAt"]) || null,
    clockedInAt: pickStr(row, ["clockedInAt"]) || null,
    expectedClockOutAt: pickStr(row, ["expectedClockOutAt"]) || null,
    clockedOutAt: pickStr(row, ["clockedOutAt"]) || null,
    completedAt: pickStr(row, ["completedAt"]) || null,
    createdAt: pickStr(row, ["createdAt", "requestedAt"]) || new Date().toISOString(),
    workerFirstName: pickStr(row, ["workerFirstName"]),
    workerLastName: pickStr(row, ["workerLastName"]),
    workerPhoneNumber: pickStr(row, ["workerPhoneNumber"]),
  };
}

export function asApproval(data: unknown): AccessRequestApproval {
  const row = coerceRow(data);
  const reviewedAt: string | null = pickDate(row, ["reviewedAt"]);
  return {
    id: pickNum(row, ["id"]),
    accessRequestId: pickNum(row, ["accessRequestId"]),
    approverUserId: pickNum(row, ["approverUserId"]),
    status: pickStr(row, ["status"]) || "Pending",
    comment: pickStr(row, ["comment"]),
    createdAt: pickStr(row, ["createdAt"]) || reviewedAt || "",
    reviewedAt,
    approverFirstName: pickStr(row, ["approverFirstName", "firstName"]),
    approverLastName: pickStr(row, ["approverLastName", "lastName"]),
    approverEmail: pickStr(row, ["approverEmail", "email"]),
    workerFirstName: pickStr(row, ["workerFirstName"]),
    workerLastName: pickStr(row, ["workerLastName"]),
    workerPhoneNumber: pickStr(row, ["workerPhoneNumber"]),
  };
}

export function pickDate(row: Record<string, unknown>, names: string[]): string | null {
  const s = pickStr(row, names);
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t) || t < Date.parse("2000-01-01T00:00:00Z")) return null;
  return s;
}

export function allFilterBody(token: string) {
  return { token };
}
