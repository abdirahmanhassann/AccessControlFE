import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, PageSkeleton } from "@/components/ui";
import { readSession } from "@/lib/session";
import { roomLabel, useStaffData, workerLabel } from "@/lib/staff-data";
import { statusTone, when } from "@/lib/format";
import { useMounted } from "@/lib/use-mounted";

export const Route = createFileRoute("/app/")({ component: Overview });

function Overview() {
  const mounted = useMounted();
  const [token, setToken] = useState<string>();
  useEffect(() => setToken(readSession()?.token), []);
  const { data, error, loading } = useStaffData(token);

  if (!mounted || loading || !data) return <PageSkeleton />;

  const pending = data.requests.filter((r) => r.status === "Pending");
  const live = data.requests.filter((r) => r.status === "Approved");
  const unread = data.notes.filter((n) => !n.readAt && n.userId);

  return (
    <div className="sg-content">
      {error ? <p className="sg-error">{error}</p> : null}
      <div className="sg-stats">
        <div className="sg-stat">
          <span>Pending</span>
          <div className="n">{pending.length}</div>
        </div>
        <div className="sg-stat">
          <span>On site now</span>
          <div className="n">{live.length}</div>
        </div>
        <div className="sg-stat">
          <span>Active rooms</span>
          <div className="n">{data.rooms.filter((r) => r.isActive).length}</div>
        </div>
        <div className="sg-stat">
          <span>Unread</span>
          <div className="n">{unread.length}</div>
        </div>
      </div>
      <div className="sg-split">
        <section className="sg-card">
          <h2>Needs a decision</h2>
          <div className="sg-list" style={{ marginTop: 14 }}>
            {pending.length === 0 ? (
              <p className="sg-muted">No pending requests. Quiet site.</p>
            ) : (
              pending.map((r) => (
                <Link key={r.id} to="/app/requests/$id" params={{ id: String(r.id) }} className="sg-list-item">
                  <div>
                    <strong>{workerLabel(data, r.workerId)}</strong>
                    <div className="sg-muted">
                      {roomLabel(data, r.roomId)} · {r.workType}
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
            {live.length === 0 ? (
              <p className="sg-muted">Nobody clocked in.</p>
            ) : (
              live.map((r) => (
                <Link key={r.id} to="/app/requests/$id" params={{ id: String(r.id) }} className="sg-list-item">
                  <div>
                    <strong>{workerLabel(data, r.workerId)}</strong>
                    <div className="sg-muted">{roomLabel(data, r.roomId)}</div>
                  </div>
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
