import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Field, Input, toast } from "@/components/ui";
import { api } from "@/lib/api/client";
import { ApiError, type AccessRequestKey, type GroupRoom, type RequestGroup } from "@/lib/api/types";
import { statusTone, whenExact } from "@/lib/format";
import { readSession } from "@/lib/session";
import { localStamp } from "@/lib/visit-window";
import { announceKeysChanged, keyTone } from "@/lib/keys";

const roomName = (r: { roomName?: string; roomNumber?: string }) => r.roomName || r.roomNumber || "Room";

export function KeyList({ keys }: { keys: AccessRequestKey[] }) {
  if (!keys.length) return null;
  return (
    <ul className="sg-list-plain">
      {keys.map((k) => (
        <li key={k.id}>
          <strong>{k.keyLabel}</strong>
          {k.tagNumber ? ` (${k.tagNumber})` : ""} <Badge tone={keyTone(String(k.status))}>{String(k.status)}</Badge>
          {k.returnBy && /^(approved|issued)$/i.test(String(k.status)) ? (
            <span className="sg-help"> return by {whenExact(k.returnBy)}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * The other rooms of a multi-room request, each accepted or rejected on its own.
 * The worker hears once, when every room has been decided.
 */
export function GroupRoomsCard({
  groupId,
  currentRequestId,
  onChanged,
}: {
  groupId: number;
  currentRequestId: number;
  onChanged?: () => void | Promise<void>;
}) {
  const [group, setGroup] = useState<RequestGroup | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    const token = readSession()?.token;
    if (!token || !groupId) return;
    try {
      setGroup(await api.getAccessRequestGroup(token, groupId));
    } catch {
      setGroup(null);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(rooms: GroupRoom[], status: "Approved" | "Rejected") {
    const session = readSession();
    if (!session || !rooms.length) return;
    if (status === "Rejected" && !comment.trim()) {
      toast("Add a reason so the worker knows why the room was declined.");
      return;
    }
    setBusy(`${status}:${rooms.map((r) => r.accessRequestId).join(",")}`);
    try {
      for (const r of rooms) {
        if (!r.approvalId) continue;
        await api.updateApproval(session.token, {
          id: r.approvalId,
          accessRequestId: r.accessRequestId,
          approverUserId: r.approverUserId || session.user.id || undefined,
          workerId: r.workerId,
          roomId: r.roomId,
          reason: r.reason,
          workType: r.workType,
          description: r.description,
          status,
          comment: status === "Rejected" ? comment.trim() : "",
          reviewedAt: localStamp(),
        });
      }
      toast(
        rooms.length > 1
          ? `${rooms.length} rooms ${status === "Approved" ? "approved" : "declined"}`
          : status === "Approved"
            ? "Room approved"
            : "Room declined",
      );
      if (status === "Rejected") setComment("");
      announceKeysChanged();
      await load();
      await onChanged?.();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not update the room");
    } finally {
      setBusy(null);
    }
  }

  if (!group || group.rooms.length < 2) return null;
  const pending = group.rooms.filter((r) => /^pending$/i.test(String(r.status)));
  const decided = group.rooms.length - pending.length;

  return (
    <section className="sg-card" style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <h2>Rooms in this request</h2>
        <Badge tone={pending.length ? "warn" : "ok"}>
          {decided}/{group.rooms.length} decided
        </Badge>
      </div>
      <p className="sg-muted">
        Approve or decline each room. The worker gets one text once every room has a decision
        {group.keys.length ? ", listing the keys to collect and when to return them" : ""}.
      </p>
      {group.rooms.map((r) => {
        const keys = group.keys.filter((k) => k.accessRequestId === r.accessRequestId);
        const isPending = /^pending$/i.test(String(r.status));
        const current = r.accessRequestId === currentRequestId;
        return (
          <div key={r.accessRequestId} className="sg-room-chip" style={current ? { borderColor: "var(--accent)" } : undefined}>
            <div className="sg-room-chip-head">
              <strong>
                {current ? (
                  roomName(r)
                ) : (
                  <Link to="/app/requests/$id" params={{ id: String(r.accessRequestId) }}>
                    {roomName(r)}
                  </Link>
                )}
                {current ? <span className="sg-help"> (this page)</span> : null}
              </strong>
              <Badge tone={statusTone(String(r.status))}>{String(r.status)}</Badge>
            </div>
            {r.workAreaName ? <small>{r.workAreaName}</small> : null}
            {r.comment && !isPending ? <small>“{r.comment}”</small> : null}
            <KeyList keys={keys} />
            {isPending ? (
              <div className="sg-actions" style={{ marginTop: 6 }}>
                <Button size="sm" variant="ok" disabled={!!busy} onClick={() => void decide([r], "Approved")}>
                  Approve
                </Button>
                <Button size="sm" variant="danger" disabled={!!busy} onClick={() => void decide([r], "Rejected")}>
                  Decline
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
      {pending.length ? (
        <>
          <Field label="Reason for declining a room (sent to the worker)">
            <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Riser locked for testing" />
          </Field>
          {pending.length > 1 ? (
            <Button variant="ok" disabled={!!busy} onClick={() => void decide(pending, "Approved")}>
              {busy?.startsWith("Approved:") ? "Saving…" : `Approve all ${pending.length} pending rooms`}
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
