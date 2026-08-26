import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, Button, Field, PageSkeleton, Textarea, toast } from "@/components/ui";
import { readSession } from "@/lib/session";
import {
  approvalApproverName,
  approvalWorkerName,
  effectiveStatus,
  latestApproval,
  roomLabel,
  useStaffData,
  userLabel,
  workerLabel,
} from "@/lib/staff-data";
import { prettyPhone, statusTone, whenExact } from "@/lib/format";
import { useMounted } from "@/lib/use-mounted";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";

export const Route = createFileRoute("/app/requests_/$id")({ component: RequestDetail });

function RequestDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const mounted = useMounted();
  const [token, setToken] = useState<string>();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setToken(readSession()?.token), []);
  const { data, loading, reload, error } = useStaffData(token);
  const req = data?.requests.find((r) => r.id === Number(id));

  async function decide(status: "Approved" | "Rejected" | "Cancelled") {
    const session = readSession();
    if (!session || !req || !data) return;
    const existing =
      data.approvals.find((a) => a.accessRequestId === req.id && /^pending$/i.test(String(a.status))) ||
      latestApproval(data, req.id);
    if (!existing?.id) {
      toast("No AccessRequestApprovals row to update for this request.");
      return;
    }
    setBusy(true);
    try {
      await api.updateApproval(session.token, {
        id: existing.id,
        status,
        comment,
        reviewedAt: new Date().toISOString(),
      });
      toast(status === "Approved" ? "Approved" : status === "Rejected" ? "Rejected" : "Cancelled");
      await reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not update approval");
    } finally {
      setBusy(false);
    }
  }

  if (!mounted || loading || !data) return <PageSkeleton />;
  if (!req) {
    const orphan = data.approvals.find((a) => a.accessRequestId === Number(id));
    return (
      <div className="sg-content">
        <p>Request not found{orphan ? `, but approval #${orphan.id} exists.` : "."}</p>
        <Button onClick={() => navigate({ to: "/app/requests" })}>Back</Button>
      </div>
    );
  }

  const worker = data.workers.find((w) => w.id === req.workerId);
  const photos = data.photos.filter((p) => p.accessRequestId === req.id);
  const approvals = data.approvals.filter((a) => a.accessRequestId === req.id);
  const events = data.audits.filter((a) => a.accessRequestId === req.id);
  const latest = latestApproval(data, req.id);
  const status = effectiveStatus(req, data.approvals);
  const workerName = workerLabel(data, req.workerId, latest || req);
  const workerPhone = worker?.phoneNumber || req.workerPhoneNumber || latest?.workerPhoneNumber || "";

  return (
    <div className="sg-content">
      {error ? <p className="sg-error">{error}</p> : null}
      <p className="sg-muted">
        <Link to="/app/requests">Requests</Link> / #{req.id}
      </p>
      <div className="sg-detail">
        <section className="sg-card" style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
            <div>
              <p className="sg-kicker">Worker</p>
              <h2>{workerName}</h2>
              <p className="sg-muted">
                {worker?.companyName || "Contractor"}
                {workerPhone ? ` · ${prettyPhone(workerPhone)}` : ""}
              </p>
            </div>
            <Badge tone={statusTone(status)}>{status}</Badge>
          </div>
          <dl className="sg-dl">
            <dt>Room</dt>
            <dd>{roomLabel(data, req.roomId)}</dd>
            <dt>Trade</dt>
            <dd>{req.workType || "—"}</dd>
            <dt>Reason</dt>
            <dd>{req.reason || "—"}</dd>
            <dt>Notes</dt>
            <dd>{req.description || "—"}</dd>
            <dt>Opened</dt>
            <dd>{whenExact(req.createdAt)}</dd>
            <dt>Approved</dt>
            <dd>{whenExact(req.approvedAt || (/^approved$/i.test(status) ? latest?.reviewedAt : null))}</dd>
            <dt>Clock in</dt>
            <dd>{whenExact(req.clockedInAt)}</dd>
            <dt>Clock out</dt>
            <dd>{whenExact(req.clockedOutAt)}</dd>
          </dl>
          {photos.length > 0 ? (
            <>
              <h3>Photos</h3>
              <div className="sg-photo-grid">
                {photos.map((p) => (
                  <div className="sg-photo" key={p.id}>
                    {p.storagePath ? (
                      <img src={p.storagePath} alt={p.originalFileName} />
                    ) : (
                      <div className="sg-empty">{p.originalFileName}</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </section>
        <aside style={{ display: "grid", gap: 16 }}>
          {latest?.id ? (
            <section className="sg-card" style={{ display: "grid", gap: 12 }}>
              <h2>Decision</h2>
              <p className="sg-muted">Calls AccessRequestApprovalsUpdate with this row's Id and ReviewedAt.</p>
              <Field label="Comment to the worker">
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
              </Field>
              <div className="sg-actions">
                <Button variant="ok" disabled={busy} onClick={() => void decide("Approved")}>
                  Approve
                </Button>
                <Button variant="danger" disabled={busy} onClick={() => void decide("Rejected")}>
                  Reject
                </Button>
                <Button disabled={busy} onClick={() => void decide("Cancelled")}>
                  Cancel
                </Button>
              </div>
            </section>
          ) : (
            <section className="sg-card">
              <p className="sg-muted">No AccessRequestApprovals row exists for this request, so it cannot be updated.</p>
            </section>
          )}
          <section className="sg-card" style={{ display: "grid", gap: 12 }}>
            <h2>Approvals</h2>
            {approvals.length === 0 ? <p className="sg-muted">None yet.</p> : null}
            {approvals.map((a) => (
              <div key={a.id}>
                <Badge tone={statusTone(String(a.status))}>{a.status}</Badge>
                <p>
                  {approvalApproverName(a) || userLabel(data, a.approverUserId, a)}
                  {" · "}
                  {whenExact(a.reviewedAt)}
                </p>
                {a.approverEmail ? <p className="sg-muted">{a.approverEmail}</p> : null}
                {a.comment ? <p className="sg-muted">{a.comment}</p> : null}
                {approvalWorkerName(a) ? (
                  <p className="sg-help">Worker on this row: {approvalWorkerName(a)}</p>
                ) : null}
              </div>
            ))}
          </section>
          <section className="sg-card" style={{ display: "grid", gap: 12 }}>
            <h2>Audit</h2>
            <div className="sg-timeline">
              {events.map((e) => (
                <div className="sg-tl-item" key={e.id}>
                  <strong>{e.eventType}</strong>
                  <span className="sg-muted">{e.description}</span>
                  <span className="sg-help">{whenExact(e.createdAt)}</span>
                </div>
              ))}
              {events.length === 0 ? <p className="sg-muted">No audit events.</p> : null}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
