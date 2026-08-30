import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Badge, Input, PageSkeleton, Select } from "@/components/ui";
import { ApprovalActions } from "@/components/ApprovalActions";
import { readSession } from "@/lib/session";
import { latestApproval, roomLabel, useStaffData, workerLabel, effectiveStatus } from "@/lib/staff-data";
import { statusTone, when } from "@/lib/format";
import { useMounted } from "@/lib/use-mounted";

export const Route = createFileRoute("/app/requests")({ component: RequestsPage });

function RequestsPage() {
  const navigate = useNavigate();
  const mounted = useMounted();
  const [token, setToken] = useState<string>();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  useEffect(() => setToken(readSession()?.token), []);
  const { data, error, loading, reload } = useStaffData(token, { pollRequests: true });

  const rows = useMemo(() => {
    if (!data) return [];
    return data.requests.filter((r) => {
      const st = effectiveStatus(r, data.approvals);
      if (status !== "all" && st !== status) return false;
      const approval = data.approvals.find((a) => a.accessRequestId === r.id);
      const hay = `${workerLabel(data, r.workerId, approval || r)} ${roomLabel(data, r.roomId)} ${r.workType} ${r.reason}`.toLowerCase();
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
          <option>Cancelled</option>
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = effectiveStatus(r, data.approvals);
              const approval = latestApproval(data, r.id);
              return (
                <tr
                  key={r.id}
                  tabIndex={0}
                  onClick={() => navigate({ to: "/app/requests/$id", params: { id: String(r.id) } })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void navigate({ to: "/app/requests/$id", params: { id: String(r.id) } });
                    }
                  }}
                >
                  <td>
                    <Link
                      to="/app/requests/$id"
                      params={{ id: String(r.id) }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {workerLabel(data, r.workerId, approval || r)}
                    </Link>
                  </td>
                  <td>{roomLabel(data, r.roomId)}</td>
                  <td>{r.workType}</td>
                  <td>
                    <Badge tone={statusTone(st)}>{st}</Badge>
                  </td>
                  <td className="sg-mono">{when(r.createdAt)}</td>
                  <td>
                    {approval?.id || approval?.accessRequestId ? (
                      <ApprovalActions approval={approval} accessRequestId={r.id} request={r} onDone={reload} />
                    ) : (
                      <span className="sg-help">No approval row</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="sg-empty">No matching requests.</p> : null}
      </div>
    </div>
  );
}
