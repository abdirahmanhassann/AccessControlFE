import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, PageSkeleton } from "@/components/ui";
import { ApprovalActions } from "@/components/ApprovalActions";
import { readSession } from "@/lib/session";
import {
  approvalApproverName,
  effectiveStatus,
  pendingRequests,
  roomLabel,
  useStaffData,
  workerForApproval,
  workerLabel,
} from "@/lib/staff-data";
import { statusTone, when, whenReviewed } from "@/lib/format";
import { useMounted } from "@/lib/use-mounted";

export const Route = createFileRoute("/app/")({ component: Overview });

function Overview() {
  const mounted = useMounted();
  const [token, setToken] = useState<string>();
  useEffect(() => setToken(readSession()?.token), []);
  const { data, error, loading, reload } = useStaffData(token);

  if (!mounted || loading || !data) return <PageSkeleton />;

  const pending = pendingRequests(data);
  const approvals = [...data.approvals].sort((a, b) => {
    const ar = a.reviewedAt ? 1 : 0;
    const br = b.reviewedAt ? 1 : 0;
    if (ar !== br) return ar - br;
    return String(b.reviewedAt || "").localeCompare(String(a.reviewedAt || ""));
  });
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
          <p className="sg-muted">Open access requests waiting on a manager.</p>
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
        <p className="sg-muted">
          Approve, reject or cancel updates AccessRequestApprovals. ReviewedAt stays empty until you decide.
        </p>
        <div className="sg-table-wrap" style={{ marginTop: 12 }}>
          <table className="sg-table">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Approver</th>
                <th>Status</th>
                <th>Reviewed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((a) => {
                const req = data.requests.find((r) => r.id === a.accessRequestId);
                return (
                  <tr key={a.id}>
                    <td>
                      <Link to="/app/requests/$id" params={{ id: String(a.accessRequestId) }}>
                        {workerForApproval(data, a)}
                      </Link>
                      {req ? <div className="sg-muted">{roomLabel(data, req.roomId)}</div> : null}
                    </td>
                    <td>
                      {approvalApproverName(a) || "—"}
                      {a.approverEmail ? <div className="sg-muted">{a.approverEmail}</div> : null}
                    </td>
                    <td>
                      <Badge tone={statusTone(String(a.status))}>{a.status}</Badge>
                    </td>
                    <td className="sg-mono">{whenReviewed(a.reviewedAt)}</td>
                    <td>
                      <ApprovalActions
                        approval={a}
                        accessRequestId={a.accessRequestId || req?.id}
                        onDone={reload}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {approvals.length === 0 ? (
            <p className="sg-empty">No approval rows yet.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
