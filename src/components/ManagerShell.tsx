import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bell,
  Building2,
  ClipboardList,
  Clock3,
  HardHat,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  Network,
  ScrollText,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { BrandMark, Button } from "@/components/ui";
import { clearSession, readSession } from "@/lib/session";
import { useMounted } from "@/lib/use-mounted";
import { API_BASE, USE_MOCK, api } from "@/lib/api/client";
import {
  activeRequests,
  canReviewRoomLeave,
  effectiveStatus,
  isOverdueClockOut,
  visitSpan,
} from "@/lib/staff-data";
import { timeRange } from "@/lib/format";
import { locationDisplay } from "@/lib/location";
import { visitPhase } from "@/lib/visit-window";
import type { AccessRequest, Session, Worker } from "@/lib/api/types";

/** Dispatch on `window` to make the sidebar re-read its counts. */
export const SIDEBAR_REFRESH_EVENT = "sitegate:sidebar-refresh";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  /** Shown only to the Keyman (and Admins). */
  keyman?: boolean;
};

const NAV: NavItem[] = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/app/requests", label: "Requests", icon: ClipboardList },
  { to: "/app/keyman", label: "Keyman", icon: KeyRound, keyman: true },
  { to: "/app/overdue", label: "Overdue", icon: AlertTriangle },
  { to: "/app/rooms", label: "Locations", icon: MapPinned },
  { to: "/app/areas", label: "Towers", icon: Building2 },
  { to: "/app/departments", label: "Departments", icon: Network },
  { to: "/app/sites", label: "Sites", icon: Warehouse },
  { to: "/app/workers", label: "Workers", icon: HardHat },
  { to: "/app/staff", label: "Staff", icon: Users },
  { to: "/app/hours", label: "Blackout hours", icon: Clock3 },
  { to: "/app/notifications", label: "Inbox", icon: Bell },
  { to: "/app/audit", label: "Audit", icon: ScrollText },
];

export function ManagerShell({ children }: { children?: ReactNode }) {
  const mounted = useMounted();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [overdue, setOverdue] = useState(0);
  const [active, setActive] = useState<AccessRequest[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [roomChecks, setRoomChecks] = useState(0);
  // Bumped when a page changes something the sidebar counts (a room check decided).
  const [countsVersion, setCountsVersion] = useState(0);

  useEffect(() => {
    const bump = () => setCountsVersion((n) => n + 1);
    window.addEventListener(SIDEBAR_REFRESH_EVENT, bump);
    return () => window.removeEventListener(SIDEBAR_REFRESH_EVENT, bump);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const s = readSession();
    if (!s || s.kind !== "staff") {
      void navigate({ to: "/" });
      return;
    }
    setSession(s);
    api
      .getAccessRequests(s.token, { take: 200 })
      .then(async (rows) => {
        let approvals: import("@/lib/api/types").AccessRequestApproval[] = [];
        try {
          approvals = await api.getApprovals(s.token, { take: 200 });
        } catch {
          approvals = [];
        }
        setPending(rows.filter((r) => /^pending$/i.test(effectiveStatus(r, approvals))).length);
        setOverdue(rows.filter((r) => isOverdueClockOut(r, approvals)).length);
        if (canReviewRoomLeave(s.user.role)) {
          setActive(activeRequests({ requests: rows, approvals }));
        }
      })
      .catch(() => {});
    if (canReviewRoomLeave(s.user.role)) {
      api
        .getRoomLeaveReviews(s.token, { status: "Pending" })
        .then((rows) => setRoomChecks(rows.length))
        .catch(() => setRoomChecks(0));
      api
        .getWorkers(s.token)
        .then(setWorkers)
        .catch(() => {});
    }
  }, [mounted, navigate, pathname, countsVersion]);

  const nav = useMemo(
    () => NAV.filter((n) => !n.keyman || canReviewRoomLeave(session?.user.role)),
    [session],
  );

  const title = useMemo(() => {
    const hit = [...nav].reverse().find((n) =>
      n.exact ? pathname === n.to : pathname === n.to || pathname.startsWith(n.to + "/"),
    );
    return hit?.label ?? "Console";
  }, [pathname, nav]);

  if (!mounted || !session) {
    return <div className="sg-content"><div className="sg-skel" style={{ height: 48 }} /></div>;
  }

  function signOut() {
    clearSession();
    void navigate({ to: "/" });
  }

  return (
    <div className="sg-shell">
      {open ? <div className="sg-nav-backdrop" onClick={() => setOpen(false)} /> : null}
      <aside className={`sg-nav ${open ? "is-open" : ""}`}>
        <BrandMark light />
        <nav className="sg-nav-list">
          {nav.map((item) => {
            const on = item.exact
              ? pathname === item.to
              : pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={on ? "is-on" : ""}
                onClick={() => setOpen(false)}
              >
                <Icon size={16} strokeWidth={1.8} />
                {item.label}
                {item.to === "/app/requests" && pending > 0 ? (
                  <span className="sg-nav-count">{pending}</span>
                ) : null}
                {item.to === "/app/overdue" && overdue > 0 ? (
                  <span className="sg-nav-count">{overdue}</span>
                ) : null}
                {item.to === "/app/keyman" && roomChecks > 0 ? (
                  <span className="sg-nav-count" title="Rooms waiting to be checked">{roomChecks}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        {canReviewRoomLeave(session.user.role) ? (
          <ActiveVisits rows={active} workers={workers} onPick={() => setOpen(false)} />
        ) : null}
        <div className="sg-nav-foot">
          <div className="sg-who">
            <strong>
              {session.user.firstName} {session.user.lastName}
            </strong>
            <span>{session.user.role}</span>
            {!USE_MOCK ? <span className="sg-help">API {API_BASE.replace(/^https?:\/\//, "")}</span> : null}
          </div>
          <Button size="sm" onClick={signOut}>
            <LogOut size={14} /> Sign out
          </Button>
        </div>
      </aside>
      <div className="sg-main">
        <header className="sg-main-bar">
          <button className="sg-menu-btn" onClick={() => setOpen(true)} aria-label="Open menu">
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
          <h1>{title}</h1>
          <div className="sg-actions">
            <span className="sg-muted">{session.user.email}</span>
            <Button size="sm" onClick={signOut}>
              <LogOut size={14} /> Sign out
            </Button>
          </div>
        </header>
        {children ?? <Outlet />}
      </div>
    </div>
  );
}

const SIDEBAR_VISITS = 6;

/** Keyman sidebar: approved visits still open, with their start and end times. */
function ActiveVisits({
  rows,
  workers,
  onPick,
}: {
  rows: AccessRequest[];
  workers: Worker[];
  onPick: () => void;
}) {
  return (
    <div className="sg-nav-section" aria-label="Active requests">
      <div className="sg-nav-section-title">
        <span>Active requests</span>
        <span>{rows.length}</span>
      </div>
      {rows.length === 0 ? <p className="sg-nav-empty">None open right now.</p> : null}
      {rows.slice(0, SIDEBAR_VISITS).map((r) => {
        const span = visitSpan(r);
        const phase = visitPhase(r);
        const worker = workers.find((w) => w.id === r.workerId);
        const who =
          [r.workerFirstName || worker?.firstName, r.workerLastName || worker?.lastName].filter(Boolean).join(" ") ||
          `Request #${r.id}`;
        const where =
          r.locationLabel ||
          (r.roomNumber || r.roomName
            ? locationDisplay({ roomNumber: r.roomNumber ?? "", name: r.roomName ?? "", locationKind: undefined })
            : "");
        return (
          <Link
            key={r.id}
            to="/app/requests/$id"
            params={{ id: String(r.id) }}
            className={`sg-nav-visit ${phase === "Overdue" ? "is-overdue" : ""}`}
            onClick={onPick}
          >
            <strong>
              {who}
              {where ? ` · ${where}` : ""}
            </strong>
            <span>
              {timeRange(span.start, span.end)}
              {phase === "Overdue" ? " · overdue" : r.clockedInAt ? " · on site" : phase === "Upcoming" ? " · upcoming" : ""}
            </span>
          </Link>
        );
      })}
      {rows.length > SIDEBAR_VISITS ? (
        <Link to="/app/keyman" className="sg-nav-more" onClick={onPick}>
          View all {rows.length}
        </Link>
      ) : null}
    </div>
  );
}
