import { ApiError } from "./types";
import { mockHandle } from "./mock";
import { readSession, readWorkerSession } from "@/lib/session";
import type {
  AccessPhoto,
  AccessRequest,
  AccessRequestApproval,
  AccessWindow,
  AuditEvent,
  CreateUserRequest,
  Department,
  DepartmentManagerMapping,
  DepartmentRoomMapping,
  LoginRequest,
  Notification,
  OTPVerification,
  Room,
  ScanQrResult,
  Session,
  Site,
  User,
  WorkArea,
  WorkAreaManager,
  Worker,
  WorkerSiteMapping,
  RoomManager,
} from "./types";

const DEFAULT_LIVE = "https://localhost:7105";
const rawBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? DEFAULT_LIVE;
export const USE_MOCK = rawBase === "mock" || rawBase === "false";
export const API_BASE = USE_MOCK ? "" : rawBase.replace(/\/$/, "") || DEFAULT_LIVE;

const SKIP_KEYS = new Set([
  "rowerror",
  "rowstate",
  "table",
  "itemarray",
  "haserrors",
  "tablerow",
]);

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function camelKey(key: string): string {
  if (!key) return key;
  if (key.includes("_")) {
    return key.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  }
  return key.charAt(0).toLowerCase() + key.slice(1);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function formatTimeSpan(value: Record<string, unknown>): string | null {
  if (!("hours" in value) && !("Hours" in value) && !("ticks" in value) && !("Ticks" in value)) {
    return null;
  }
  const hours = Number(value.hours ?? value.Hours ?? 0);
  const minutes = Number(value.minutes ?? value.Minutes ?? 0);
  const seconds = Number(value.seconds ?? value.Seconds ?? 0);
  if ([hours, minutes, seconds].some((n) => Number.isNaN(n))) return null;
  const pad = (n: number) => String(Math.trunc(n)).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize);
  if (!isPlainObject(value)) return value;
  const span = formatTimeSpan(value);
  if (span) return span;

  const tableRows = value.Table ?? value.table ?? value.Rows ?? value.rows;
  if (Array.isArray(tableRows)) return camelize(tableRows);

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (SKIP_KEYS.has(key.toLowerCase())) continue;
    out[camelKey(key)] = camelize(nested);
  }
  if (out.userId != null && out.managerUserId == null) out.managerUserId = out.userId;
  if (out.requestedAt != null && out.createdAt == null) out.createdAt = out.requestedAt;
  if (out.reviewedAt != null && out.createdAt == null) out.createdAt = out.reviewedAt;
  if (out.roomName != null && out.name == null) out.name = out.roomName;
  const looksLikeRoom =
    out.id == null &&
    (out.roomNumber != null || out.qrCodeIdentifier != null || out.workAreaId != null);
  if (looksLikeRoom) {
    const rid = pickNum(out, ["id", "roomId", "roomID"]);
    if (rid) out.id = rid;
  }
  return out;
}

export function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value == null) return [];
  if (isPlainObject(value)) {
    const nested = Object.values(value).find((v) => Array.isArray(v));
    if (nested) return nested as T[];
  }
  return [];
}

function unwrapEnvelope(payload: unknown): unknown {
  if (!isPlainObject(payload)) return payload;
  const result = payload.Result ?? payload.result;
  const errorMessage = payload.ErrorMessage ?? payload.errorMessage;
  const hasEnvelope = "Result" in payload || "result" in payload;
  if (!hasEnvelope) return payload;
  if (result === false) {
    throw new ApiError(400, String(errorMessage || "Request failed"));
  }
  let data: unknown;
  if ("Data" in payload) data = payload.Data;
  else if ("data" in payload) data = payload.data;
  else return null;
  if (typeof data === "string") return decode(data);
  return data;
}

function decode(text: string): unknown {
  if (!text) return null;
  try {
    let data: unknown = JSON.parse(text);
    if (typeof data === "string") {
      const trimmed = data.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          data = JSON.parse(trimmed);
        } catch {
          return data;
        }
      }
    }
    return data;
  } catch {
    return text;
  }
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  const decoded = decode(text);
  if (!res.ok) {
    let message = res.statusText || `HTTP ${res.status}`;
    if (isPlainObject(decoded)) {
      message = String(
        decoded.ErrorMessage ?? decoded.errorMessage ?? decoded.message ?? decoded.title ?? message,
      );
    } else if (typeof decoded === "string" && decoded) {
      message = decoded;
    } else if (text) {
      message = text;
    }
    throw new ApiError(res.status, message);
  }
  return unwrapEnvelope(decoded);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  if (USE_MOCK) {
    await delay(180 + Math.floor(Math.random() * 120));
    try {
      return mockHandle(path, body) as T;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(500, err instanceof Error ? err.message : "Request failed");
    }
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new ApiError(
      0,
      `Cannot reach AccessControl at ${API_BASE}. Keep the API running, and open that address once in this browser so the HTTPS certificate is trusted.`,
    );
  }
  const data = camelize(await parseBody(res));
  return data as T;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pickNum(row: Record<string, unknown>, names: string[]): number {
  const want = new Set(names.map((n) => n.toLowerCase()));
  for (const [key, value] of Object.entries(row)) {
    if (!want.has(key.toLowerCase())) continue;
    const n = num(value);
    if (n) return n;
  }
  return 0;
}

function pickStr(row: Record<string, unknown>, names: string[]): string {
  const want = new Set(names.map((n) => n.toLowerCase()));
  for (const [key, value] of Object.entries(row)) {
    if (!want.has(key.toLowerCase())) continue;
    if (value == null) continue;
    const s = String(value).trim();
    if (s) return s;
  }
  return "";
}

function coerceRow(data: unknown): Record<string, unknown> {
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

function asRoom(data: unknown): ScanQrResult {
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

function asAudit(data: unknown): AuditEvent {
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

function asUserRow(data: unknown): User {
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

function asDepartment(data: unknown): Department {
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

function asWorkArea(data: unknown): WorkArea {
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

function asSite(data: unknown): Site {
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

function asWorkerRow(
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

function asRequestRow(data: unknown): AccessRequest {
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

function asApproval(data: unknown): AccessRequestApproval {
  const row = coerceRow(data);
  const reviewedAt = pickDate(row, ["reviewedAt"]);
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

function pickDate(row: Record<string, unknown>, names: string[]): string | null {
  const s = pickStr(row, names);
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t) || t < Date.parse("2000-01-01T00:00:00Z")) return null;
  return s;
}

function allFilterBody(token: string) {
  return { token };
}

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

function listFilterBody(token: string, filter?: ListFilter) {
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

function asPagedList<T>(
  raw: unknown,
  map: (row: unknown) => T,
  keep: (row: T) => boolean,
): PagedList<T> {
  const source = asArray<unknown>(raw);
  const rows = source.map(map).filter(keep) as PagedList<T>;
  rows.total = pickNum(coerceRow(source[0]), ["total"]) || rows.length;
  return rows;
}

function dual(payload: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...payload };
  for (const [key, value] of Object.entries(payload)) {
    if (!key || key[0] !== key[0].toLowerCase()) continue;
    out[key.charAt(0).toUpperCase() + key.slice(1)] = value;
  }
  return out;
}

async function resolveRoom(qrCodeIdentifier: string, raw: unknown): Promise<ScanQrResult> {
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

function placeholderUser(email: string): User {
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

function asWorker(
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

function asRequest(
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

export const api = {
  login: async (req: LoginRequest): Promise<LoginResult> => {
    const data = await post<unknown>("/Access/login", req);
    const token =
      typeof data === "string"
        ? data
        : isPlainObject(data)
          ? String(data.token ?? data.Token ?? "")
          : "";
    if (!token) throw new ApiError(401, "Login did not return a token.");
    let user: User | undefined;
    try {
      const users = asArray<unknown>(await post("/Access/getusers", { token })).map((row) =>
        asUserRow(row),
      );
      user =
        users.find((u) => u.email?.toLowerCase() === req.email.toLowerCase()) ?? users[0];
    } catch {
      /* token is still usable */
    }
    return { token, user: user ?? placeholderUser(req.email) };
  },
  signup: (req: CreateUserRequest) => post<unknown>("/Access/signup", { ...req, Token: req.token, token: req.token }),
  requestPasswordReset: async (email: string) => {
    const data = await post<unknown>("/Access/requestpasswordreset", { email, Email: email });
    const row = coerceRow(data);
    return { sent: true, code: pickStr(row, ["code"]) || undefined };
  },
  resetPassword: (data: { email: string; code: string; password: string }) =>
    post<unknown>("/Access/resetpassword", {
      email: data.email,
      Email: data.email,
      code: data.code,
      Code: Number(data.code) || data.code,
      password: data.password,
      Password: data.password,
    }),
  scanQr: async (qrCodeIdentifier: string) => {
    const raw = await post<unknown>("/Access/scanqr", { qrCodeIdentifier });
    const room = await resolveRoom(qrCodeIdentifier, raw);
    if (room.scanKind === "site" || (room.siteId && !room.id)) {
      return { ...room, scanKind: "site" as const };
    }
    if (!room.id) {
      throw new ApiError(
        400,
        "QR was accepted but AccessControl did not return a room or site id. Scan the gate QR for this site.",
      );
    }
    return { ...room, scanKind: "room" as const };
  },

  getSites: (token: string) =>
    post("/Access/getsites", { token }).then((data) => asArray<unknown>(data).map(asSite).filter((s) => s.id)),
  listSites: async () =>
    asArray<unknown>(
      await post("/Access/getsites", {
        token: readWorkerSession()?.token || readSession()?.token || "",
      }),
    )
      .map(asSite)
      .filter((s) => s.id && s.isActive !== false),
  insertSite: (token: string, data: Omit<Site, "id" | "isActive">) =>
    post<Site | null>("/Access/insertsite", { token, ...data }),
  updateSite: (token: string, data: Site) => post<Site | null>("/Access/updatesite", { token, ...data }),

  getWorkAreas: (token: string, siteId?: number) =>
    post("/Access/getworkareas", { token, siteId, SiteId: siteId }).then((data) =>
      asArray<unknown>(data).map(asWorkArea).filter((a) => a.id),
    ),
  listTowers: async (siteId?: number) =>
    asArray<unknown>(
      await post("/Access/getworkareas", {
        siteId: siteId ?? 0,
        SiteId: siteId ?? 0,
        token: readWorkerSession()?.token || readSession()?.token || "",
      }),
    )
      .map(asWorkArea)
      .filter((a) => a.id && a.isActive !== false && (!siteId || a.siteId === siteId || !a.siteId)),
  listLocations: async (opts: { workAreaId?: number; siteId?: number }) =>
    asArray<unknown>(
      await post("/Access/getrooms", {
        workAreaId: opts.workAreaId,
        WorkAreaId: opts.workAreaId,
        siteId: opts.siteId,
        SiteId: opts.siteId,
      }),
    )
      .map((row) => asRoom(row))
      .filter((r) => r.id && r.isActive !== false),
  insertWorkArea: (token: string, data: Omit<WorkArea, "id" | "isActive">) =>
    post<WorkArea | null>("/Access/insertworkarea", { token, ...data }),
  updateWorkArea: (token: string, data: WorkArea) =>
    post<WorkArea | null>("/Access/updateworkarea", { token, ...data }),

  getUsers: async (token: string) =>
    asArray<unknown>(await post("/Access/getusers", { token }))
      .map((row) => asUserRow(row))
      .filter((row) => row.id),
  listManagers: async (roomId?: number, departmentId?: number) => {
    if (roomId || departmentId) {
      return asArray<unknown>(
        await post("/Access/getmanagersforroom", {
          roomId: roomId ?? 0,
          RoomId: roomId ?? 0,
          departmentId: departmentId ?? 0,
          DepartmentId: departmentId ?? 0,
        }),
      )
        .map((row) => asUserRow(row))
        .filter((row) => row.id && row.isActive !== false);
    }
    const token = readWorkerSession()?.token || readSession()?.token || "";
    const users = asArray<unknown>(await post("/Access/getusers", { token }))
      .map((row) => asUserRow(row))
      .filter((row) => row.id && row.isActive !== false);
    const managers = users.filter((u) => /^(admin|sitemanager|manager)$/i.test(String(u.role)));
    return managers.length ? managers : users;
  },
  insertUser: (token: string, data: Partial<User> & { password?: string }) =>
    post<User | null>("/Access/insertuser", { token, Token: token, ...data, Password: data.password }),
  updateUser: (token: string, data: User) => post<User | null>("/Access/updateuser", { token, ...data }),
  setUserPassword: (token: string, id: number, password: string) =>
    post("/Access/setuserpassword", { token, Token: token, id, Id: id, password, Password: password }),

  getWorkAreaManagers: (token: string) =>
    post<WorkAreaManager[]>("/Access/getworkareamanagers", { token }).then(asArray<WorkAreaManager>),
  insertWorkAreaManager: (token: string, data: Omit<WorkAreaManager, "id">) =>
    post<WorkAreaManager | null>("/Access/insertworkareamanager", { token, ...data }),
  updateWorkAreaManager: (token: string, data: WorkAreaManager) =>
    post<WorkAreaManager | null>("/Access/updateworkareamanager", { token, ...data }),

  getDepartments: (token: string, siteId?: number) =>
    post("/Access/getdepartments", { token, siteId, SiteId: siteId }).then((data) =>
      asArray<unknown>(data).map(asDepartment),
    ),
  listDepartments: async (siteId: number) =>
    asArray<unknown>(
      await post("/Access/getdepartments", {
        token: readWorkerSession()?.token || readSession()?.token || "",
        siteId,
        SiteId: siteId,
      }),
    )
      .map(asDepartment)
      .filter((d) => d.id && d.name && d.isActive !== false && (!siteId || !d.siteId || d.siteId === siteId)),
  listDepartmentsForRoom: async (roomId: number) =>
    asArray<unknown>(await post("/Access/getdepartmentsforroom", { roomId, RoomId: roomId }))
      .map(asDepartment)
      .filter((d) => d.id && d.name && d.isActive !== false),
  insertDepartment: (token: string, data: { siteId: number; name: string; description?: string }) =>
    post("/Access/insertdepartment", dual({ token, ...data })),
  updateDepartment: (token: string, data: Department) =>
    post("/Access/updatedepartment", dual({ token, ...data })),

  getDepartmentRoomMappings: (token: string) =>
    post<DepartmentRoomMapping[]>("/Access/getdepartmentroommappings", { token }).then(
      asArray<DepartmentRoomMapping>,
    ),
  insertDepartmentRoomMapping: (token: string, data: { departmentId: number; roomId: number }) =>
    post("/Access/insertdepartmentroommapping", dual({ token, ...data })),
  deleteDepartmentRoomMapping: (token: string, id: number) =>
    post("/Access/deletedepartmentroommapping", dual({ token, id })),

  getDepartmentManagerMappings: (token: string) =>
    post<DepartmentManagerMapping[]>("/Access/getdepartmentmanagermappings", { token }).then(
      asArray<DepartmentManagerMapping>,
    ),
  insertDepartmentManagerMapping: (
    token: string,
    data: { departmentId: number; userId: number; isPrimary?: boolean },
  ) => post("/Access/insertdepartmentmanagermapping", dual({ token, ...data, isPrimary: data.isPrimary ?? false })),
  deleteDepartmentManagerMapping: (token: string, id: number) =>
    post("/Access/deletedepartmentmanagermapping", dual({ token, id })),

  getWorkerSiteMappings: (token: string) =>
    post<WorkerSiteMapping[]>("/Access/getworkersitemappings", { token }).then(asArray<WorkerSiteMapping>),
  insertWorkerSiteMapping: (token: string, data: { workerId: number; siteId: number }) =>
    post("/Access/insertworkersitemapping", dual({ token, ...data })),
  deleteWorkerSiteMapping: (token: string, id: number) =>
    post("/Access/deleteworkersitemapping", dual({ token, id })),

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
    const roomText = String(data.roomText ?? "").trim();
    if (!roomId && (!workAreaId || !roomText)) {
      throw new ApiError(400, "Enter the room.");
    }
    const payload: Record<string, unknown> = {
      phoneNumber: data.phoneNumber,
      PhoneNumber: data.phoneNumber,
      workerId,
      WorkerId: workerId,
      roomId,
      RoomId: roomId,
      workAreaId,
      WorkAreaId: workAreaId,
      roomText,
      RoomText: roomText,
      roomNumber: roomText,
      RoomNumber: roomText,
      departmentId: num(data.departmentId),
      DepartmentId: num(data.departmentId),
      locationKind: data.locationKind ?? "",
      LocationKind: data.locationKind ?? "",
      reason: data.reason,
      Reason: data.reason,
      workType: data.workType,
      WorkType: data.workType,
      description: data.description,
      Description: data.description,
      supervisorName: data.supervisorName ?? "",
      SupervisorName: data.supervisorName ?? "",
      workFrom: data.workFrom ?? "",
      WorkFrom: data.workFrom ?? "",
      workTo: data.workTo ?? "",
      WorkTo: data.workTo ?? "",
    };
    if (data.qrCodeIdentifier) {
      payload.qrCodeIdentifier = data.qrCodeIdentifier;
      payload.QrCodeIdentifier = data.qrCodeIdentifier;
    }
    const approverUserId = num(data.approverUserId);
    if (approverUserId) {
      payload.approverUserId = approverUserId;
      payload.ApproverUserId = approverUserId;
    }
    const created = await post<unknown>("/Access/insertaccessrequest", payload);
    const resolvedRoomId = pickNum(coerceRow(created), ["roomId"]) || roomId;
    return asRequest(created, {
      ...data,
      roomId: resolvedRoomId,
      workerId,
    });
  },
  updateAccessRequest: (token: string | undefined, data: Partial<AccessRequest> & { id: number }) => {
    const payload: Record<string, unknown> = { ...data };
    if (token) payload.token = token;
    return post<AccessRequest | null>("/Access/updateaccessrequest", dual(payload));
  },

  getApprovals: async (token: string, filter?: ListFilter) =>
    asPagedList(
      await post("/Access/getaccessrequestapprovals", listFilterBody(token, filter)),
      (row) => asApproval(row),
      (row) => Boolean(row.id || row.accessRequestId),
    ),
  insertApproval: (
    token: string,
    data: { accessRequestId: number; approverUserId: number; status: string; comment: string },
  ) =>
    post<AccessRequestApproval | null>(
      "/Access/insertaccessrequestapproval",
      dual({
        token,
        accessRequestId: data.accessRequestId,
        approverUserId: data.approverUserId,
        status: data.status,
        comment: data.comment ?? "",
      }),
    ),
  updateApproval: (
    token: string,
    data: {
      id: number;
      accessRequestId: number;
      status: string;
      comment?: string | null;
      reviewedAt?: string | null;
      approverUserId?: number;
      workerId?: number;
      roomId?: number;
      reason?: string | null;
      workType?: string | null;
      description?: string | null;
    },
  ) => {
    const accessRequestApprovalId = num(data.id);
    const accessRequestId = num(data.accessRequestId);
    if (!accessRequestApprovalId) {
      throw new ApiError(400, "AccessRequestApprovalId is required.");
    }
    if (!accessRequestId) {
      throw new ApiError(400, "AccessRequestId is required.");
    }
    const reviewedAt = data.reviewedAt ?? new Date().toISOString().slice(0, 19);
    const approved = /^approved$/i.test(data.status);
    const rejected = /^rejected$/i.test(data.status);
    const payload: Record<string, unknown> = {
      token,
      id: accessRequestApprovalId,
      accessRequestApprovalId,
      accessRequestId,
      status: data.status,
      comment: data.comment ?? "",
      reviewedAt,
      reason: data.reason ?? data.comment ?? "",
      workType: data.workType ?? "",
      description: data.description ?? "",
      approvedAt: approved ? reviewedAt : null,
      rejectedAt: rejected ? reviewedAt : null,
    };
    const approverUserId = num(data.approverUserId);
    const workerId = num(data.workerId);
    const roomId = num(data.roomId);
    if (approverUserId) payload.approverUserId = approverUserId;
    if (workerId) payload.workerId = workerId;
    if (roomId) payload.roomId = roomId;
    return post<AccessRequestApproval | null>("/Access/updateaccessrequestapproval", dual(payload));
  },

  getPhotos: (token: string) =>
    post<AccessPhoto[]>("/Access/getaccessphotos", { token }).then(asArray<AccessPhoto>),
  insertPhoto: (token: string, data: Omit<AccessPhoto, "id">) =>
    post<AccessPhoto | null>("/Access/insertaccessphoto", { token, ...data }),
  updatePhoto: (token: string, data: AccessPhoto) =>
    post<AccessPhoto | null>("/Access/updateaccessphoto", { token, ...data }),

  getOtps: (token: string) =>
    post<OTPVerification[]>("/Access/getotpverifications", { token }).then(asArray<OTPVerification>),
  insertOtp: (phoneNumber: string, expiresAt: string) =>
    post<OTPVerification & { code?: string }>("/Access/insertotpverification", {
      phoneNumber,
      expiresAt,
    }),
  verifyOtp: async (code: number) => {
    const data = await post<unknown>("/Access/verifyotp", { code });
    const row = coerceRow(data);
    const nested =
      isPlainObject(data) && (isPlainObject(data.worker) || isPlainObject(data.Worker))
        ? coerceRow(data.worker ?? data.Worker)
        : {};
    const merged = { ...nested, ...row };
    const workerId = pickNum(merged, ["workerId", "id"]);
    const hasWorkerFields = Boolean(
      pickStr(merged, ["firstName"]) ||
        pickStr(merged, ["lastName"]) ||
        pickStr(merged, ["companyName"]) ||
        pickStr(merged, ["workerPhoneNumber"]),
    );
    const worker =
      workerId && (hasWorkerFields || pickStr(merged, ["phoneNumber"]))
        ? asWorkerRow(merged)
        : workerId
          ? asWorkerRow({ ...merged, id: workerId, workerId })
          : null;
    return {
      verified: true,
      token: String(merged.token ?? row.token ?? ""),
      worker: worker?.id ? worker : null,
      phoneNumber: String(merged.phoneNumber ?? merged.workerPhoneNumber ?? ""),
    };
  },
  updateOtp: (token: string, data: OTPVerification) =>
    post<OTPVerification | null>("/Access/updateotpverification", { token, ...data }),

  getNotifications: (token: string) =>
    post<Notification[]>("/Access/getnotifications", { token }).then(asArray<Notification>),
  insertNotification: (token: string, data: Partial<Notification>) =>
    post<Notification | null>("/Access/insertnotification", { token, ...data }),
  updateNotification: (token: string, data: Partial<Notification> & { id: number }) =>
    post<Notification | null>("/Access/updatenotification", { token, ...data }),

  getAudits: async (token: string) =>
    asArray<unknown>(await post("/Access/getauditevents", { token }))
      .map((row) => asAudit(row))
      .filter((row) => row.id || row.eventType),
  insertAudit: (token: string, data: Partial<AuditEvent>) =>
    post<AuditEvent | null>(
      "/Access/insertauditevent",
      dual({
        token,
        accessRequestId: data.accessRequestId ?? null,
        workerId: data.workerId ?? null,
        userId: data.userId ?? null,
        eventType: data.eventType ?? "Note",
        description: data.description ?? "",
        ipAddress: data.ipAddress ?? "",
        metadata: data.metadata ?? "",
      }),
    ),
};

export function normalizeLogin(result: LoginResult | string): Session {
  if (typeof result === "string") {
    return {
      token: result,
      user: placeholderUser(""),
      kind: "staff",
    };
  }
  return { token: result.token, user: result.user, kind: "staff" };
}
