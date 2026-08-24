import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, Input, PageSkeleton } from "@/components/ui";
import { readSession } from "@/lib/session";
import { useStaffData } from "@/lib/staff-data";
import { useMounted } from "@/lib/use-mounted";
import { whenExact } from "@/lib/format";

export const Route = createFileRoute("/app/audit")({ component: AuditPage });

function AuditPage() {
  const mounted = useMounted();
  const [token, setToken] = useState<string>();
  const [q, setQ] = useState("");
  useEffect(() => setToken(readSession()?.token), []);
  const { data, error, loading } = useStaffData(token);

  if (!mounted || loading || !data) return <PageSkeleton />;

  const rows = data.audits.filter((a) => {
    const hay = `${a.eventType} ${a.description} ${a.metadata}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div className="sg-content">
      {error ? <p className="sg-error">{error}</p> : null}
      <div className="sg-toolbar">
        <Input placeholder="Search events" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="sg-table-wrap">
        <table className="sg-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Event</th>
              <th>Detail</th>
              <th>Request</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} style={{ cursor: a.accessRequestId ? "pointer" : "default" }}>
                <td className="sg-mono">{whenExact(a.createdAt)}</td>
                <td>
                  <Badge tone="accent">{a.eventType}</Badge>
                </td>
                <td>{a.description}</td>
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
      </div>
    </div>
  );
}
