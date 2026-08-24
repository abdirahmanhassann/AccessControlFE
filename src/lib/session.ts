import type { Session } from "@/lib/api/types";

const KEY = "sitegate.session";

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function writeSession(session: Session) {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

const WORKER_KEY = "sitegate.worker-session";

export function readWorkerSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(WORKER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function writeWorkerSession(session: Session) {
  sessionStorage.setItem(WORKER_KEY, JSON.stringify(session));
}

export function clearWorkerSession() {
  sessionStorage.removeItem(WORKER_KEY);
}
