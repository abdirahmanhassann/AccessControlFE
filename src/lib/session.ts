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

/**
 * How long a verified worker session stays usable.
 *
 * The worker verifies their phone on the way in and signs out on the way out,
 * and a shift sits in between — the phone locks, the tab is backgrounded, the
 * browser is killed by the OS. The session has to outlive all of that, so it
 * is stored in `localStorage` next to the persisted worker flow
 * (`sitegate.worker-flow`) rather than in `sessionStorage`. The two used to
 * live in different stores, so a restored flow would land the worker on the
 * sign-out screen holding a clocked-in visit and no session to close it with.
 *
 * The TTL is what `sessionStorage` used to provide implicitly: a bound on how
 * long a shared site phone stays verified for whoever used it last.
 */
export const WORKER_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export type WorkerSession = Session & { expiresAt?: string };

function parseWorkerSession(raw: string | null): WorkerSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as WorkerSession | null;
    if (!parsed) return null;
    // `/Access/verifyotp` does not mint a token, so what identifies a worker
    // session is the phone number it was verified against and the worker it
    // resolved to. A token is kept when there is one and sent when present.
    const identified =
      Boolean(parsed.token?.trim()) ||
      Boolean(parsed.phoneNumber?.trim()) ||
      Number(parsed.workerId) > 0;
    return identified ? parsed : null;
  } catch {
    return null;
  }
}

function isExpired(session: WorkerSession): boolean {
  if (!session.expiresAt) return false;
  const at = Date.parse(session.expiresAt);
  return Number.isFinite(at) && at <= Date.now();
}

/**
 * Read the stored record, moving a session written by an earlier build out of
 * `sessionStorage` on the way. Without the migration, upgrading mid-shift
 * would sign out every worker who is already on site.
 */
function loadWorkerSession(): WorkerSession | null {
  try {
    const current = parseWorkerSession(localStorage.getItem(WORKER_KEY));
    if (current) return current;
  } catch {
    /* storage can throw in private mode; fall through to the legacy read */
  }
  try {
    const legacy = parseWorkerSession(sessionStorage.getItem(WORKER_KEY));
    if (!legacy) return null;
    sessionStorage.removeItem(WORKER_KEY);
    const migrated: WorkerSession = {
      ...legacy,
      expiresAt: legacy.expiresAt ?? new Date(Date.now() + WORKER_SESSION_TTL_MS).toISOString(),
    };
    localStorage.setItem(WORKER_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return null;
  }
}

export function readWorkerSession(): WorkerSession | null {
  if (typeof window === "undefined") return null;
  const session = loadWorkerSession();
  if (!session) return null;
  if (isExpired(session)) {
    clearWorkerSession();
    return null;
  }
  return session;
}

/** The token to send with worker calls. Normally `""` — the API mints none. */
export function readWorkerToken(): string {
  return readWorkerSession()?.token?.trim() ?? "";
}

/**
 * Store a verified worker session. An `expiresAt` already on the session is
 * kept, so the routine updates worker.tsx makes (attaching the worker id after
 * registration, say) refresh the record without extending the window.
 */
export function writeWorkerSession(session: WorkerSession) {
  const expiresAt =
    session.expiresAt ?? new Date(Date.now() + WORKER_SESSION_TTL_MS).toISOString();
  try {
    localStorage.setItem(WORKER_KEY, JSON.stringify({ ...session, expiresAt }));
  } catch {
    /* nothing to fall back to: the caller handles a session that will not stick */
  }
}

export function clearWorkerSession() {
  try {
    localStorage.removeItem(WORKER_KEY);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(WORKER_KEY);
  } catch {
    /* ignore */
  }
}
