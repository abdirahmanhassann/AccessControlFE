import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, Button, Field, PageSkeleton, Textarea, toast } from "@/components/ui";
import { readSession } from "@/lib/session";
import { roomLabel, useStaffData, userLabel, workerLabel } from "@/lib/staff-data";
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

  async function decide(status: "Approved" | "Rejected") {
    const session = readSession();
    if (!session || !req) return;
    setBusy(true);
    try {
      await api.updateApproval(session.token, {
        id: req.id,
        accessRequestId: req.id,
        approverUserId: session.user.id,
        status,
        comment,
      });
      toast(status === "Approved" ? "Worker notified — access granted" : "Worker notified — request declined");
      await reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not save decision");
    } finally {
      setBusy(false);
    }
  }

  if (!mounted || loading || !data) return <PageSkeleton />;
  if (!req) {
    return (
      <div className="sg-content">
        <p>Request not found.</p>
        <Button onClick={() => navigate({ to: "/app/requests" })}>Back</Button>
      </div>
    );
  }

  const worker = data.workers.find((w) => w.id === req.workerId);
  const photos = data.photos.filter((p) => p.accessRequestId === req.id);
  const approvals = data.approvals.filter((a) => a.accessRequestId === req.id);
  const events = data.audits.filter((a) => a.accessRequestId === req.id);

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
              <h2>{workerLabel(data, req.workerId)}</h2>
              <p className="sg-muted">
                {worker?.companyName} · {worker ? prettyPhone(worker.phoneNumber) : ""}
              </p>
            </div>
            <Badge tone={statusTone(req.status)}>{req.status}</Badge>
          </div>
          <dl className="sg-dl">
            <dt>Room</dt>
            <dd>{roomLabel(data, req.roomId)}</dd>
            <dt>Trade</dt>
            <dd>{req.workType}</dd>
            <dt>Reason</dt>
            <dd>{req.reason}</dd>
            <dt>Notes</dt>
            <dd>{req.description || "—"}</dd>
            <dt>Opened</dt>
            <dd>{whenExact(req.createdAt)}</dd>
            <dt>Approved</dt>
            <dd>{whenExact(req.approvedAt)}</dd>
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
          {req.status === "Pending" ? (
            <section className="sg-card" style={{ display: "grid", gap: 12 }}>
              <h2>Decision</h2>
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
              </div>
            </section>
          ) : null}
          <section className="sg-card" style={{ display: "grid", gap: 12 }}>
            <h2>Approvals</h2>
            {approvals.length === 0 ? <p className="sg-muted">None yet.</p> : null}
            {approvals.map((a) => (
              <div key={a.id}>
                <Badge tone={statusTone(String(a.status))}>{a.status}</Badge>
                <p>
                  {userLabel(data, a.approverUserId)} · {whenExact(a.createdAt)}
                </p>
                {a.comment ? <p className="sg-muted">{a.comment}</p> : null}
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
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
