import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, Input, PageSkeleton } from "@/components/ui";
import { readSession } from "@/lib/session";
import { useStaffData, userLabel, workerLabel } from "@/lib/staff-data";
import { useMounted } from "@/lib/use-mounted";
import { when, whenExact } from "@/lib/format";
import type { AuditEvent } from "@/lib/api/types";

export const Route = createFileRoute("/app/audit")({ component: AuditPage });

function eventTone(type: string) {
  const s = type.toLowerCase();
  if (s.includes("approv") || s.includes("clockedin")) return "ok" as const;
  if (s.includes("reject") || s.includes("cancel") || s.includes("fail")) return "danger" as const;
  if (s.includes("request") || s.includes("submit") || s.includes("pending")) return "warn" as const;
  if (s.includes("clock")) return "accent" as const;
  return "muted" as const;
}

function actorName(data: NonNullable<ReturnType<typeof useStaffData>["data"]>, a: AuditEvent) {
  if (a.userId) return userLabel(data, a.userId);
  if (a.workerId) return workerLabel(data, a.workerId);
  return "—";
}

function AuditPage() {
  const mounted = useMounted();
  const [token, setToken] = useState<string>();
  const [q, setQ] = useState("");
  useEffect(() => setToken(readSession()?.token), []);
  const { data, error, loading, reload } = useStaffData(token);

  if (!mounted || loading || !data) return <PageSkeleton />;

  const rows = [...data.audits]
    .filter((a) => {
      const hay = `${a.eventType} ${a.description} ${a.metadata} ${a.ipAddress}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  return (
    <div className="sg-content">
      {error ? <p className="sg-error">{error}</p> : null}
      <div className="sg-toolbar">
        <Input placeholder="Search audit logs" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="sg-btn sg-btn-ghost sg-btn-sm" type="button" onClick={() => void reload()}>
          Refresh
        </button>
      </div>
      <div className="sg-table-wrap">
        <table className="sg-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Event</th>
              <th>Actor</th>
              <th>Detail</th>
              <th>Request</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id || `${a.eventType}-${a.createdAt}`}>
                <td className="sg-mono">
                  {whenExact(a.createdAt)}
                  <div className="sg-muted">{when(a.createdAt)}</div>
                </td>
                <td>
                  <Badge tone={eventTone(a.eventType)}>{a.eventType || "Event"}</Badge>
                </td>
                <td>{actorName(data, a)}</td>
                <td>
                  {a.description || "—"}
                  {a.ipAddress ? <div className="sg-muted sg-mono">{a.ipAddress}</div> : null}
                </td>
                <td>
                  {a.accessRequestId ? (
                    <Link to="/app/requests/$id" params={{ id: String(a.accessRequestId) }}>
                      #{a.accessRequestId}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="sg-empty">No audit events yet. Approvals and worker submissions write here.</p>
        ) : null}
      </div>
    </div>
  );
}
