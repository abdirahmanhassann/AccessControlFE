import { ApiError } from "./types";
import { mockHandle } from "./mock";
import { forceStaffLogin } from "./auth-redirect";

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

export function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function camelKey(key: string): string {
  if (!key) return key;
  if (key.includes("_")) {
    return key.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  }
  return key.charAt(0).toLowerCase() + key.slice(1);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function formatTimeSpan(value: Record<string, unknown>): string | null {
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

export function camelize(value: unknown): unknown {
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

export function unwrapEnvelope(payload: unknown): unknown {
  if (typeof payload === "string") {
    const parsed = decode(payload.trim());
    if (parsed !== payload) return unwrapEnvelope(parsed);
    return payload;
  }
  if (!isPlainObject(payload)) return payload;
  const result = payload.Result ?? payload.result;
  const errorMessage = payload.ErrorMessage ?? payload.errorMessage;
  const hasEnvelope = "Result" in payload || "result" in payload;
  if (!hasEnvelope) return payload;
  if (result === false) {
    const message = String(errorMessage || "Request failed");
    forceStaffLogin(message);
    throw new ApiError(400, message);
  }
  let data: unknown;
  if ("Data" in payload) data = payload.Data;
  else if ("data" in payload) data = payload.data;
  else return null;
  if (typeof data === "string") return decode(data);
  return data;
}

export function decode(text: string): unknown {
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

export async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  const decoded = decode(text);
  if (!res.ok) {
    let message = res.statusText || `HTTP ${res.status}`;
    if (isPlainObject(decoded)) {
      message = String(
        decoded.ErrorMessage ?? decoded.errorMessage ?? decoded.message ?? decoded.title ?? message,
      );
    } else if (typeof decoded === "string" && decoded) {
      const inner = decode(decoded);
      if (isPlainObject(inner)) {
        message = String(inner.ErrorMessage ?? inner.errorMessage ?? inner.message ?? decoded);
      } else {
        message = decoded;
      }
    } else if (text) {
      message = text;
    }
    forceStaffLogin(message);
    throw new ApiError(res.status, message);
  }
  return unwrapEnvelope(decoded);
}

export async function post<T>(path: string, body: unknown): Promise<T> {
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

/** Multipart form POST (e.g. photo upload). Do not set Content-Type — browser sets boundary. */
export async function postForm<T>(path: string, form: FormData): Promise<T> {
  if (USE_MOCK) {
    await delay(180 + Math.floor(Math.random() * 120));
    try {
      const body: Record<string, unknown> = {};
      form.forEach((value, key) => {
        if (typeof value === "string") body[key] = value;
        else body[key] = value.name || "file";
      });
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
      headers: { Accept: "application/json" },
      body: form,
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

export function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function pickNum(row: Record<string, unknown>, names: string[]): number {
  const want = new Set(names.map((n) => n.toLowerCase()));
  for (const [key, value] of Object.entries(row)) {
    if (!want.has(key.toLowerCase())) continue;
    const n = num(value);
    if (n) return n;
  }
  return 0;
}

export function pickStr(row: Record<string, unknown>, names: string[]): string {
  const want = new Set(names.map((n) => n.toLowerCase()));
  for (const [key, value] of Object.entries(row)) {
    if (!want.has(key.toLowerCase())) continue;
    if (value == null) continue;
    const s = String(value).trim();
    if (s) return s;
  }
  return "";
}
