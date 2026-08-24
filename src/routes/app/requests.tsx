import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Badge, Input, PageSkeleton, Select } from "@/components/ui";
import { readSession } from "@/lib/session";
import { roomLabel, useStaffData, workerLabel } from "@/lib/staff-data";
import { statusTone, when } from "@/lib/format";
import { useMounted } from "@/lib/use-mounted";

export const Route = createFileRoute("/app/requests")({ component: RequestsPage });

function RequestsPage() {
  const mounted = useMounted();
  const [token, setToken] = useState<string>();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  useEffect(() => setToken(readSession()?.token), []);
  const { data, error, loading } = useStaffData(token);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.requests.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      const hay = `${workerLabel(data, r.workerId)} ${roomLabel(data, r.roomId)} ${r.workType} ${r.reason}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [data, q, status]);

  if (!mounted || loading || !data) return <PageSkeleton />;

  return (
    <div className="sg-content">
      {error ? <p className="sg-error">{error}</p> : null}
      <div className="sg-toolbar">
        <Input placeholder="Search worker, room, trade" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option>Pending</option>
          <option>Approved</option>
          <option>Rejected</option>
          <option>Completed</option>
        </Select>
      </div>
      <div className="sg-table-wrap">
        <table className="sg-table">
          <thead>
            <tr>
              <th>Worker</th>
              <th>Room</th>
              <th>Trade</th>
              <th>Status</th>
              <th>Opened</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to="/app/requests/$id" params={{ id: String(r.id) }}>
                    {workerLabel(data, r.workerId)}
                  </Link>
                </td>
                <td>{roomLabel(data, r.roomId)}</td>
                <td>{r.workType}</td>
                <td>
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                </td>
                <td className="sg-mono">{when(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="sg-empty">No matching requests.</p> : null}
      </div>
    </div>
  );
}
