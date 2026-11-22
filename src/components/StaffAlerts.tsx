import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui";
import { api } from "@/lib/api/client";
import type { Notification, Session } from "@/lib/api/types";

/** How often the console checks for new alerts while it is open. */
const POLL_MS = 30_000;

/** Dispatch on `window` to check for alerts straight away (used after actions, and by tests). */
export const ALERTS_CHECK_EVENT = "sitegate:alerts-check";

/** Fired when new alerts arrive, so the sidebar counts reload. */
const SIDEBAR_REFRESH_EVENT = "sitegate:sidebar-refresh";

/** Notification types that pop up as an alert, with their heading and where the button goes. */
const ALERTS: Record<string, { title: string; action: string; to: (n: Notification) => string }> = {
  RoomLeaveReview: { title: "Room to check", action: "Check room", to: () => "/app/keyman" },
  KeyLate: { title: "Key not returned", action: "Open keys", to: () => "/app/keyman" },
  KeysToIssue: { title: "Keys to hand out", action: "Open keys", to: () => "/app/keyman" },
  KeyMissing: {
    title: "Key missing",
    action: "Open request",
    to: (n) => (n.accessRequestId ? `/app/requests/${n.accessRequestId}` : "/app/requests"),
  },
};

const isUnread = (n: Notification) => !n.readAt && !/^read$/i.test(String(n.status));

/**
 * Pops up new alerts for the signed-in staff member (a worker has left a room, a key
 * is late, keys to hand out, a key missing) while the console is open, and reports
 * the unread count for the Inbox badge. An alert stays up (across pages and reloads)
 * until it is opened or dismissed. Alerts from before the console was first opened in
 * this browser (older than two hours) are not popped up; they wait in the Inbox. Desktop pop-ups fire once each.
 */
export function StaffAlerts({ session, onUnread }: { session: Session; onUnread: (count: number) => void }) {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<Notification[]>([]);
  const [desktop, setDesktop] = useState<NotificationPermission | "unsupported">("unsupported");
  const busy = useRef(false);
  const userId = session.kind === "staff" ? session.user.id : 0;
  const seenKey = `sitegate.alerts.since.${userId}`;
  const poppedKey = `sitegate.alerts.popped.${userId}`;

  useEffect(() => {
    setDesktop(typeof window !== "undefined" && "Notification" in window ? window.Notification.permission : "unsupported");
  }, []);

  const check = useCallback(async () => {
    if (busy.current || !userId) return;
    busy.current = true;
    try {
      const rows = await api.getNotifications(session.token);
      const mine = rows.filter((n) => n.userId === userId);
      onUnread(mine.filter(isUnread).length);
      const newest = mine.reduce((max, n) => Math.max(max, n.id), 0);
      const stored = localStorage.getItem(seenKey);
      let since: number;
      if (stored === null) {
        // First time in this browser: alerts from the last two hours still pop up,
        // older ones wait in the Inbox.
        const cutoff = Date.now() - 2 * 3600_000;
        since = mine
          .filter((n) => {
            const t = Date.parse(n.createdAt);
            return !Number.isFinite(t) || t < cutoff;
          })
          .reduce((max, n) => Math.max(max, n.id), 0);
        localStorage.setItem(seenKey, String(since));
      } else {
        since = Number(stored) || 0;
      }
      // Every alert since then stays up until it is opened or dismissed (which marks it read).
      const open = mine
        .filter((n) => n.id > since && isUnread(n) && ALERTS[n.type])
        .sort((a, b) => b.id - a.id)
        .slice(0, 4);
      setAlerts(open);
      const popped = Number(localStorage.getItem(poppedKey) ?? since) || 0;
      const fresh = open.filter((n) => n.id > popped);
      if (newest > popped) localStorage.setItem(poppedKey, String(newest));
      if (!fresh.length) return;
      window.dispatchEvent(new Event(SIDEBAR_REFRESH_EVENT));
      if ("Notification" in window && window.Notification.permission === "granted") {
        for (const n of fresh.slice(0, 3)) {
          try {
            new window.Notification(`SiteGate: ${ALERTS[n.type].title}`, { body: n.message, tag: `sg-${n.id}` });
          } catch {
            // Some browsers only allow this from a service worker; the in-page alert still shows.
          }
        }
      }
    } catch {
      // Offline or signed out: try again on the next tick.
    } finally {
      busy.current = false;
    }
  }, [onUnread, poppedKey, seenKey, session.token, userId]);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), POLL_MS);
    const now = () => void check();
    window.addEventListener(ALERTS_CHECK_EVENT, now);
    window.addEventListener("focus", now);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(ALERTS_CHECK_EVENT, now);
      window.removeEventListener("focus", now);
    };
  }, [check]);

  async function close(n: Notification, go: boolean) {
    setAlerts((prev) => prev.filter((a) => a.id !== n.id));
    try {
      await api.updateNotification(session.token, { id: n.id, status: "Read", readAt: new Date().toISOString() });
    } catch {
      // It stays unread in the Inbox.
    }
    void check();
    if (go) void navigate({ to: ALERTS[n.type].to(n) });
  }

  async function turnOnDesktop() {
    if (!("Notification" in window)) return;
    setDesktop(await window.Notification.requestPermission());
  }

  if (!alerts.length) return null;

  return (
    <div className="sg-alerts" role="status" aria-live="polite">
      {alerts.map((n, i) => {
        const kind = ALERTS[n.type];
        return (
          <div key={n.id} className="sg-alert-card">
            <div className="sg-alert-head">
              <BellRing size={16} strokeWidth={1.8} />
              <strong>{kind.title}</strong>
              <button type="button" className="sg-alert-x" aria-label="Dismiss alert" onClick={() => void close(n, false)}>
                <X size={14} />
              </button>
            </div>
            <p>{n.message}</p>
            <div className="sg-alert-actions">
              <Button size="sm" onClick={() => void close(n, true)}>
                {kind.action}
              </Button>
              {i === 0 && desktop === "default" ? (
                <button type="button" className="sg-link" onClick={() => void turnOnDesktop()}>
                  Turn on desktop alerts
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
