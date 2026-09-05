import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  ClipboardList,
  Clock3,
  HardHat,
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
import { effectiveStatus } from "@/lib/staff-data";
import type { Session } from "@/lib/api/types";

const NAV = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/app/requests", label: "Requests", icon: ClipboardList },
  { to: "/app/rooms", label: "Locations", icon: MapPinned },
  { to: "/app/areas", label: "Towers", icon: Building2 },
  { to: "/app/departments", label: "Departments", icon: Network },
  { to: "/app/sites", label: "Sites", icon: Warehouse },
  { to: "/app/workers", label: "Workers", icon: HardHat },
  { to: "/app/staff", label: "Staff", icon: Users },
  { to: "/app/hours", label: "Access hours", icon: Clock3 },
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

  useEffect(() => {
    if (!mounted) return;
    const s = readSession();
    if (!s || s.kind !== "staff") {
      void navigate({ to: "/login" });
      return;
    }
    setSession(s);
    api
      .getAccessRequests(s.token, { status: "Pending", take: 50 })
      .then(async (rows) => {
        let approvals: import("@/lib/api/types").AccessRequestApproval[] = [];
        try {
          approvals = await api.getApprovals(s.token, { take: 50 });
        } catch {
          approvals = [];
        }
        setPending(rows.filter((r) => /^pending$/i.test(effectiveStatus(r, approvals))).length);
      })
      .catch(() => {});
  }, [mounted, navigate, pathname]);

  const title = useMemo(() => {
    const hit = [...NAV].reverse().find((n) =>
      n.exact ? pathname === n.to : pathname === n.to || pathname.startsWith(n.to + "/"),
    );
    return hit?.label ?? "Console";
  }, [pathname]);

  if (!mounted || !session) {
    return <div className="sg-content"><div className="sg-skel" style={{ height: 48 }} /></div>;
  }

  function signOut() {
    clearSession();
    void navigate({ to: "/login" });
  }

  return (
    <div className="sg-shell">
      {open ? <div className="sg-nav-backdrop" onClick={() => setOpen(false)} /> : null}
      <aside className={`sg-nav ${open ? "is-open" : ""}`}>
        <BrandMark light />
        <nav className="sg-nav-list">
          {NAV.map((item) => {
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
              </Link>
            );
          })}
        </nav>
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
