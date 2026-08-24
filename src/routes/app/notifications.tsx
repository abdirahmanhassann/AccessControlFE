import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, Button, PageSkeleton, toast } from "@/components/ui";
import { readSession } from "@/lib/session";
import { useStaffData } from "@/lib/staff-data";
import { useMounted } from "@/lib/use-mounted";
import { statusTone, when } from "@/lib/format";
import { api } from "@/lib/api/client";

export const Route = createFileRoute("/app/notifications")({ component: NotesPage });

function NotesPage() {
  const mounted = useMounted();
  const [token, setToken] = useState<string>();
  useEffect(() => setToken(readSession()?.token), []);
  const { data, error, loading, reload } = useStaffData(token);

  if (!mounted || loading || !data) return <PageSkeleton />;

  const mine = data.notes.filter((n) => n.userId == null || n.userId === readSession()?.user.id);

  return (
    <div className="sg-content">
      {error ? <p className="sg-error">{error}</p> : null}
      <div className="sg-list">
        {mine.map((n) => (
          <div key={n.id} className="sg-list-item" style={{ cursor: "default" }}>
            <div>
              <strong>{n.type}</strong>
              <div>{n.message}</div>
              <div className="sg-muted">
                {n.channel} · {when(n.createdAt)}
              </div>
            </div>
            <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
              <Badge tone={statusTone(String(n.status))}>{n.readAt ? "Read" : n.status}</Badge>
              {!n.readAt ? (
                <Button
                  size="sm"
                  onClick={() => {
                    const t = readSession()?.token;
                    if (!t) return;
                    void api
                      .updateNotification(t, {
                        id: n.id,
                        status: "Read",
                        readAt: new Date().toISOString(),
                      })
                      .then(() => {
                        toast("Marked read");
                        return reload();
                      });
                  }}
                >
                  Mark read
                </Button>
              ) : null}
            </div>
          </div>
        ))}
        {mine.length === 0 ? <p className="sg-empty">Inbox is clear.</p> : null}
      </div>
    </div>
  );
}
