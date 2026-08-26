import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, PageSkeleton } from "@/components/ui";
import { readSession } from "@/lib/session";
import {
  approvalApproverName,
  approvalWorkerName,
  effectiveStatus,
  pendingRequests,
  roomLabel,
  useStaffData,
  workerLabel,
} from "@/lib/staff-data";
import { prettyPhone, statusTone, when } from "@/lib/format";
import { useMounted } from "@/lib/use-mounted";

export const Route = createFileRoute("/app/")({ component: Overview });

function Overview() {
  const mounted = useMounted();
  const [token, setToken] = useState<string>();
  useEffect(() => setToken(readSession()?.token), []);
  const { data, error, loading } = useStaffData(token);

  if (!mounted || loading || !data) return <PageSkeleton />;

  const pending = pendingRequests(data);
  const approvals = [...data.approvals].sort((a, b) =>
    String(b.reviewedAt || b.createdAt).localeCompare(String(a.reviewedAt || a.createdAt)),
  );
  const approved = approvals.filter((a) => /^approved$/i.test(String(a.status)));
  const rejected = approvals.filter((a) => /^rejected$/i.test(String(a.status)));
  const onSite = data.requests.filter((r) => {
    const status = effectiveStatus(r, data.approvals);
    return /^approved$/i.test(status) && !r.clockedOutAt;
  });

  return (
    <div className="sg-content">
      {error ? <p className="sg-error">{error}</p> : null}
      <div className="sg-stats">
        <div className="sg-stat">
          <span>Pending requests</span>
          <div className="n">{pending.length}</div>
        </div>
        <div className="sg-stat">
          <span>Approved</span>
          <div className="n">{approved.length}</div>
        </div>
        <div className="sg-stat">
          <span>Rejected</span>
          <div className="n">{rejected.length}</div>
        </div>
        <div className="sg-stat">
          <span>On site now</span>
          <div className="n">{onSite.length}</div>
        </div>
      </div>
      <div className="sg-split">
        <section className="sg-card">
          <h2>Needs a decision</h2>
          <p className="sg-muted">Open access requests that do not yet have an approval.</p>
          <div className="sg-list" style={{ marginTop: 14 }}>
            {pending.length === 0 ? (
              <p className="sg-muted">No pending worker requests.</p>
            ) : (
              pending.map((r) => (
                <Link key={r.id} to="/app/requests/$id" params={{ id: String(r.id) }} className="sg-list-item">
                  <div>
                    <strong>{workerLabel(data, r.workerId, r)}</strong>
                    <div className="sg-muted">
                      {roomLabel(data, r.roomId)} · {r.workType || "Access"}
                    </div>
                  </div>
                  <Badge tone="warn">{when(r.createdAt)}</Badge>
                </Link>
              ))
            )}
          </div>
        </section>
        <section className="sg-card">
          <h2>Currently in rooms</h2>
          <div className="sg-list" style={{ marginTop: 14 }}>
            {onSite.length === 0 ? (
              <p className="sg-muted">Nobody clocked in.</p>
            ) : (
              onSite.map((r) => (
                <Link key={r.id} to="/app/requests/$id" params={{ id: String(r.id) }} className="sg-list-item">
                  <div>
                    <strong>{workerLabel(data, r.workerId, r)}</strong>
                    <div className="sg-muted">{roomLabel(data, r.roomId)}</div>
                  </div>
                  <Badge tone="ok">Approved</Badge>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
      <section className="sg-card">
        <h2>Access request approvals</h2>
        <p className="sg-muted">From AccessRequestApprovals — worker is the contractor, approver is staff.</p>
        <div className="sg-table-wrap" style={{ marginTop: 12 }}>
          <table className="sg-table">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Phone</th>
                <th>Approver</th>
                <th>Status</th>
                <th>Reviewed</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to="/app/requests/$id" params={{ id: String(a.accessRequestId) }}>
                      {approvalWorkerName(a) || workerLabel(data, 0, a)}
                    </Link>
                  </td>
                  <td className="sg-mono">{a.workerPhoneNumber ? prettyPhone(a.workerPhoneNumber) : "—"}</td>
                  <td>
                    {approvalApproverName(a) || "—"}
                    {a.approverEmail ? <div className="sg-muted">{a.approverEmail}</div> : null}
                  </td>
                  <td>
                    <Badge tone={statusTone(String(a.status))}>{a.status}</Badge>
                  </td>
                  <td className="sg-mono">{when(a.reviewedAt || a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {approvals.length === 0 ? (
            <p className="sg-empty">No approval rows yet. Approve or reject a worker request to create one.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
