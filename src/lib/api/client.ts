import { ApiError } from "./types";
import { mockHandle } from "./mock";
import { readSession } from "@/lib/session";
import type {
  AccessPhoto,
  AccessRequest,
  AccessRequestApproval,
  AccessWindow,
  AuditEvent,
  CreateUserRequest,
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
  if (isPlainObject(data) && data.id != null) return data as unknown as AccessRequest;
  return {
    id: 0,
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
  signup: (req: CreateUserRequest) => post<unknown>("/Access/signup", req),
  scanQr: async (qrCodeIdentifier: string) => {
    const raw = await post<unknown>("/Access/scanqr", { qrCodeIdentifier });
    const room = await resolveRoom(qrCodeIdentifier, raw);
    if (!room.id) {
      throw new ApiError(
        400,
        "QR was accepted but AccessControl did not return a room id. Scan a room QR that exists in the database.",
      );
    }
    return room;
  },

  getSites: (token: string) => post<Site[]>("/Access/getsites", { token }).then(asArray<Site>),
  insertSite: (token: string, data: Omit<Site, "id" | "isActive">) =>
    post<Site | null>("/Access/insertsite", { token, ...data }),
  updateSite: (token: string, data: Site) => post<Site | null>("/Access/updatesite", { token, ...data }),

  getWorkAreas: (token: string) =>
    post<WorkArea[]>("/Access/getworkareas", { token }).then(asArray<WorkArea>),
  insertWorkArea: (token: string, data: Omit<WorkArea, "id" | "isActive">) =>
    post<WorkArea | null>("/Access/insertworkarea", { token, ...data }),
  updateWorkArea: (token: string, data: WorkArea) =>
    post<WorkArea | null>("/Access/updateworkarea", { token, ...data }),

  getUsers: async (token: string) =>
    asArray<unknown>(await post("/Access/getusers", { token }))
      .map((row) => asUserRow(row))
      .filter((row) => row.id),
  insertUser: (token: string, data: Partial<User>) =>
    post<User | null>("/Access/insertuser", { token, ...data }),
  updateUser: (token: string, data: User) => post<User | null>("/Access/updateuser", { token, ...data }),

  getWorkAreaManagers: (token: string) =>
    post<WorkAreaManager[]>("/Access/getworkareamanagers", { token }).then(asArray<WorkAreaManager>),
  insertWorkAreaManager: (token: string, data: Omit<WorkAreaManager, "id">) =>
    post<WorkAreaManager | null>("/Access/insertworkareamanager", { token, ...data }),
  updateWorkAreaManager: (token: string, data: WorkAreaManager) =>
    post<WorkAreaManager | null>("/Access/updateworkareamanager", { token, ...data }),

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
    data: { workAreaId: number; roomNumber: string; name: string; description: string },
  ) => post<Room | null>("/Access/insertroom", { token, ...data }),
  updateRoom: (token: string, data: Room) => post<Room | null>("/Access/updateroom", { token, ...data }),

  getAccessWindows: (token: string) =>
    post<AccessWindow[]>("/Access/getaccesswindows", { token }).then(asArray<AccessWindow>),
  insertAccessWindow: (token: string, data: Omit<AccessWindow, "id" | "isActive">) =>
    post<AccessWindow | null>("/Access/insertaccesswindow", { token, ...data }),
  updateAccessWindow: (token: string, data: AccessWindow) =>
    post<AccessWindow | null>("/Access/updateaccesswindow", { token, ...data }),

  getAccessRequests: async (token: string) =>
    asArray<unknown>(await post("/Access/getaccessrequests", { token }))
      .map((row) => asRequestRow(row))
      .filter((row) => row.id),
  insertAccessRequest: async (data: {
    phoneNumber: string;
    workerId: number;
    roomId: number;
    reason: string;
    workType: string;
    description: string;
    qrCodeIdentifier?: string;
  }) => {
    const roomId = num(data.roomId);
    const workerId = num(data.workerId);
    if (!roomId) {
      throw new ApiError(400, "Room id is missing. Scan the room QR again.");
    }
    const payload: Record<string, unknown> = {
      phoneNumber: data.phoneNumber,
      PhoneNumber: data.phoneNumber,
      workerId,
      WorkerId: workerId,
      roomId,
      RoomId: roomId,
      reason: data.reason,
      Reason: data.reason,
      workType: data.workType,
      WorkType: data.workType,
      description: data.description,
      Description: data.description,
    };
    if (data.qrCodeIdentifier) {
      payload.qrCodeIdentifier = data.qrCodeIdentifier;
      payload.QrCodeIdentifier = data.qrCodeIdentifier;
    }
    return asRequest(await post<unknown>("/Access/insertaccessrequest", payload), {
      ...data,
      roomId,
      workerId,
    });
  },
  updateAccessRequest: (token: string, data: Partial<AccessRequest> & { id: number }) =>
    post<AccessRequest | null>("/Access/updateaccessrequest", { token, ...data }),

  getApprovals: async (token: string) =>
    asArray<unknown>(await post("/Access/getaccessrequestapprovals", allFilterBody(token)))
      .map((row) => asApproval(row))
      .filter((row) => row.id || row.accessRequestId),
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
      status: string;
      comment?: string | null;
      reviewedAt?: string | null;
      accessRequestId?: number;
      approverUserId?: number;
    },
  ) => {
    const id = num(data.id);
    if (!id) {
      throw new ApiError(400, "Approval id is required. AccessRequestApprovalsUpdate keys on Id.");
    }
    const reviewedAt = data.reviewedAt ?? new Date().toISOString().slice(0, 19);
    const payload: Record<string, unknown> = {
      token,
      id,
      status: data.status,
      comment: data.comment ?? "",
      reviewedAt,
    };
    const accessRequestId = num(data.accessRequestId);
    const approverUserId = num(data.approverUserId);
    if (accessRequestId) payload.accessRequestId = accessRequestId;
    if (approverUserId) payload.approverUserId = approverUserId;
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
    const row = isPlainObject(data) ? data : {};
    const worker =
      row.worker && isPlainObject(row.worker)
        ? (row.worker as unknown as Worker)
        : row.id && (row.firstName || row.phoneNumber)
          ? (row as unknown as Worker)
          : null;
    return {
      verified: true,
      token: String(row.token ?? ""),
      worker,
      phoneNumber: String(row.phoneNumber ?? ""),
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

  getAudits: (token: string) =>
    post<AuditEvent[]>("/Access/getauditevents", { token }).then(asArray<AuditEvent>),
  insertAudit: (token: string, data: Partial<AuditEvent>) =>
    post<AuditEvent | null>("/Access/insertauditevent", { token, ...data }),
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
