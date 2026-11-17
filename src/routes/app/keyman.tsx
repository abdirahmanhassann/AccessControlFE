import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Check, KeyRound, X } from "lucide-react";
import { Badge, Button, Field, PageSkeleton, Textarea, toast } from "@/components/ui";
import { readSession } from "@/lib/session";
import {
  activeRequests,
  canReviewRoomLeave,
  displayStatus,
  roomLabel,
  useStaffData,
  visitSpan,
  workerLabel,
  type StaffData,
} from "@/lib/staff-data";
import { statusTone, timeRange, when, whenExact } from "@/lib/format";
import { useMounted } from "@/lib/use-mounted";
import { api } from "@/lib/api/client";
import { SIDEBAR_REFRESH_EVENT } from "@/components/ManagerShell";
import { ApiError, type AccessPhoto, type RoomLeaveReview, type Session } from "@/lib/api/types";

export const Route = createFileRoute("/app/keyman")({ component: KeymanPage });

const POLL_MS = 30_000;

/** Room checks and photos, polled so a sign-out shows up without a refresh. */
function useRoomLeaveReviews(token: string | undefined) {
  const [reviews, setReviews] = useState<RoomLeaveReview[]>([]);
  const [photos, setPhotos] = useState<AccessPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      const [rows, pics] = await Promise.all([
        api.getRoomLeaveReviews(token),
        api.getPhotos(token).catch(() => [] as AccessPhoto[]),
      ]);
      setReviews(rows);
      setPhotos(pics);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load room checks");
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    void reload();
    if (!token) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void reload();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [token, reload]);

  return { reviews, photos, error, loaded, reload };
}

function KeymanPage() {
  const mounted = useMounted();
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => setSession(readSession()), []);
  const token = session?.token;
  const { data, error, loading } = useStaffData(token, { pollRequests: true });
  const checks = useRoomLeaveReviews(token);

  if (!mounted || loading || !data || !checks.loaded) return <PageSkeleton />;

  const canReview = canReviewRoomLeave(session?.user.role);
  const pending = checks.reviews.filter((r) => r.status === "Pending");
  const decided = checks.reviews.filter((r) => r.status !== "Pending").slice(0, 15);
  const active = activeRequests(data);
  const onSite = active.filter((r) => r.clockedInAt);

  return (
    <div className="sg-content">
      {error ? <p className="sg-error">{error}</p> : null}
      {checks.error ? <p className="sg-error">{checks.error}</p> : null}
      <p className="sg-muted">
        When a worker signs out of a room and has taken their photos, it lands here. Check the room is
        how they left it, then approve the room leave or reject it with a reason.
      </p>

      <div className="sg-stats">
        <div className="sg-stat">
          <span>Rooms to check</span>
          <div className="n">{pending.length}</div>
        </div>
        <div className="sg-stat">
          <span>Active requests</span>
          <div className="n">{active.length}</div>
        </div>
        <div className="sg-stat">
          <span>On site now</span>
          <div className="n">{onSite.length}</div>
        </div>
        <div className="sg-stat">
          <span>Rejected room leaves</span>
          <div className="n">{checks.reviews.filter((r) => r.status === "Rejected").length}</div>
        </div>
      </div>

      <section className="sg-card" style={{ display: "grid", gap: 14 }}>
        <div>
          <h2>Rooms to check</h2>
          <p className="sg-muted">Oldest first. Each one waits for a Keyman before the visit is fully closed.</p>
        </div>
        {!canReview ? (
          <p className="sg-help">You can see room checks, but only a Keyman or an Admin can sign them off.</p>
        ) : null}
        {pending.length === 0 ? (
          <p className="sg-muted">No rooms waiting. You will see one here as soon as a worker signs out.</p>
        ) : (
          <div className="sg-list">
            {pending.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                data={data}
                photos={checks.photos.filter((p) => p.accessRequestId === review.accessRequestId)}
                canReview={canReview}
                token={token ?? ""}
                onDone={() => void checks.reload()}
              />
            ))}
          </div>
        )}
      </section>

      <section className="sg-card" style={{ display: "grid", gap: 14 }}>
        <div>
          <h2>Active requests</h2>
          <p className="sg-muted">Approved visits the worker has not signed out of yet, with their time frame.</p>
        </div>
        {active.length === 0 ? (
          <p className="sg-muted">No approved visits are open.</p>
        ) : (
          <div className="sg-table-wrap">
            <table className="sg-table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Location</th>
                  <th>Start – end</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {active.map((r) => {
                  const span = visitSpan(r);
                  const status = r.clockedInAt && displayStatus(r, data.approvals) === "Active"
                    ? "On site"
                    : displayStatus(r, data.approvals);
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link to="/app/requests/$id" params={{ id: String(r.id) }}>
                          {workerLabel(data, r.workerId, r)}
                        </Link>
                        {r.workType ? <div className="sg-muted">{r.workType}</div> : null}
                      </td>
                      <td>{r.locationLabel || roomLabel(data, r.roomId)}</td>
                      <td className="sg-mono">{timeRange(span.start, span.end)}</td>
                      <td>
                        <Badge tone={statusTone(status)}>{status}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="sg-card" style={{ display: "grid", gap: 14 }}>
        <h2>Recently checked</h2>
        {decided.length === 0 ? (
          <p className="sg-muted">Nothing signed off yet.</p>
        ) : (
          <div className="sg-list">
            {decided.map((r) => (
              <Link
                key={r.id}
                to="/app/requests/$id"
                params={{ id: String(r.accessRequestId) }}
                className="sg-list-item"
              >
                <div>
                  <strong>{reviewWorker(r, data)}</strong>
                  <div className="sg-muted">
                    {reviewRoom(r, data)} · {reviewerName(r)} · {when(r.reviewedAt)}
                  </div>
                  {r.status === "Rejected" && r.reason ? (
                    <div className="sg-error" style={{ marginTop: 4 }}>
                      {r.reason}
                    </div>
                  ) : null}
                </div>
                <Badge tone={r.status === "Approved" ? "ok" : "danger"}>
                  {r.status === "Approved" ? "Room OK" : "Rejected"}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function reviewWorker(r: RoomLeaveReview, data: StaffData) {
  const joined = [r.workerFirstName, r.workerLastName].filter(Boolean).join(" ").trim();
  return joined || workerLabel(data, r.workerId);
}

function reviewRoom(r: RoomLeaveReview, data: StaffData) {
  if (data.rooms.some((room) => room.id === r.roomId)) return roomLabel(data, r.roomId);
  const room = [r.roomNumber, r.roomName && r.roomName !== r.roomNumber ? r.roomName : ""]
    .filter(Boolean)
    .join(" ");
  return [room || `Location #${r.roomId}`, r.workAreaName, r.siteName].filter(Boolean).join(" · ");
}

function reviewerName(r: RoomLeaveReview) {
  return [r.reviewerFirstName, r.reviewerLastName].filter(Boolean).join(" ").trim() || "Keyman";
}

function ReviewCard({
  review,
  data,
  photos,
  canReview,
  token,
  onDone,
}: {
  review: RoomLeaveReview;
  data: StaffData;
  photos: AccessPhoto[];
  canReview: boolean;
  token: string;
  onDone: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"Approved" | "Rejected" | null>(null);
  const [error, setError] = useState("");

  async function decide(status: "Approved" | "Rejected") {
    if (status === "Rejected" && !reason.trim()) {
      setError("Say what is wrong with the room.");
      return;
    }
    setBusy(status);
    setError("");
    try {
      await api.reviewRoomLeave(token, { id: review.id, status, reason: reason.trim() });
      toast(status === "Approved" ? "Room leave approved" : "Room leave rejected");
      window.dispatchEvent(new Event(SIDEBAR_REFRESH_EVENT));
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the room check");
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="sg-card" style={{ display: "grid", gap: 12, boxShadow: "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div>
          <p className="sg-kicker">
            <KeyRound size={12} /> Room check
          </p>
          <h3>{reviewRoom(review, data)}</h3>
          <p className="sg-muted">
            <Link to="/app/requests/$id" params={{ id: String(review.accessRequestId) }}>
              {reviewWorker(review, data)}
            </Link>
            {review.companyName ? ` · ${review.companyName}` : ""}
            {review.workType ? ` · ${review.workType}` : ""}
          </p>
        </div>
        <Badge tone="warn">Waiting {when(review.requestedAt).replace(/ ago$/, "")}</Badge>
      </div>

      <dl className="sg-dl">
        <dt>Time frame</dt>
        <dd>{timeRange(review.workFrom || review.clockedInAt, review.workTo)}</dd>
        <dt>Clocked in</dt>
        <dd>{whenExact(review.clockedInAt)}</dd>
        <dt>Signed out</dt>
        <dd>{whenExact(review.clockedOutAt || review.requestedAt)}</dd>
      </dl>

      {photos.length > 0 ? (
        <div className="sg-photo-grid">
          {photos.map((p) => (
            <a className="sg-photo" key={p.id} href={p.storagePath} target="_blank" rel="noreferrer">
              <img src={p.storagePath} alt={p.originalFileName || "Room photo"} />
            </a>
          ))}
        </div>
      ) : (
        <p className="sg-help">
          {review.photoCount > 0
            ? `${review.photoCount} photo(s) on this visit are still loading.`
            : "No photos on this visit (a manager may have signed the worker out)."}
        </p>
      )}

      {canReview ? (
        <>
          {rejecting ? (
            <Field label="Reason for rejecting" hint="The worker and the approving manager are told.">
              <Textarea
                value={reason}
                autoFocus
                placeholder="e.g. Ceiling tile left out above the riser door"
                onChange={(e) => {
                  setReason(e.target.value);
                  setError("");
                }}
              />
            </Field>
          ) : null}
          {error ? <p className="sg-error">{error}</p> : null}
          <div className="sg-actions">
            {rejecting ? (
              <>
                <Button variant="danger" disabled={!!busy} onClick={() => void decide("Rejected")}>
                  <X size={14} /> {busy === "Rejected" ? "Saving…" : "Reject room leave"}
                </Button>
                <Button
                  disabled={!!busy}
                  onClick={() => {
                    setRejecting(false);
                    setError("");
                  }}
                >
                  Back
                </Button>
              </>
            ) : (
              <>
                <Button variant="ok" disabled={!!busy} onClick={() => void decide("Approved")}>
                  <Check size={14} /> {busy === "Approved" ? "Saving…" : "Room is fine — approve"}
                </Button>
                <Button variant="danger" disabled={!!busy} onClick={() => setRejecting(true)}>
                  Reject…
                </Button>
              </>
            )}
          </div>
        </>
      ) : null}
    </article>
  );
}
