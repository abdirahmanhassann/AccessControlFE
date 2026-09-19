import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, PageSkeleton } from "@/components/ui";
import { readSession } from "@/lib/session";
import { dueClockOutAt, overdueClockOuts, roomLabel, useStaffData, workerLabel } from "@/lib/staff-data";
import { when, whenExact } from "@/lib/format";
import { useMounted } from "@/lib/use-mounted";

export const Route = createFileRoute("/app/overdue")({ component: OverduePage });

function OverduePage() {
  const mounted = useMounted();
  const [token, setToken] = useState<string>();
  useEffect(() => setToken(readSession()?.token), []);
  const { data, error, loading } = useStaffData(token, { pollRequests: true });

  if (!mounted || loading || !data) return <PageSkeleton />;

  const rows = overdueClockOuts(data);

  return (
    <div className="sg-content">
      {error ? <p className="sg-error">{error}</p> : null}
      <p className="sg-muted">
        Workers who clocked in and are still on site after the <strong>Work to</strong> time on their
        request.
      </p>
      <section className="sg-card" style={{ marginTop: 16 }}>
        <h2>Overdue clock-outs</h2>
        <div className="sg-list" style={{ marginTop: 14 }}>
          {rows.length === 0 ? (
            <p className="sg-muted">Nobody is overdue.</p>
          ) : (
            rows.map((r) => {
              const due = dueClockOutAt(r);
              return (
                <Link key={r.id} to="/app/requests/$id" params={{ id: String(r.id) }} className="sg-list-item">
                  <div>
                    <strong>{workerLabel(data, r.workerId, r)}</strong>
                    <div className="sg-muted">
                      {roomLabel(data, r.roomId)} · due {whenExact(due)}
                    </div>
                  </div>
                  <Badge tone="danger">{when(due)}</Badge>
                </Link>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
