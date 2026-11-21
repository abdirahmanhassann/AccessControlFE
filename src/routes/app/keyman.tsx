import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Check, Download, KeyRound, X } from "lucide-react";
import { Badge, Button, Field, PageSkeleton, Textarea, toast } from "@/components/ui";
import { readSession } from "@/lib/session";
import {
  activeRequests,
  canReviewRoomLeave,
  displayStatus,
  isManagerRole,
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
import { KeymanKeys, RequestKeysCheck } from "@/components/KeymanKeys";
import { ApiError, type AccessPhoto, type RoomLeaveReview, type Session } from "@/lib/api/types";

export const Route = createFileRoute("/app/keyman")({ component: KeymanPage });

const POLL_MS = 30_000;

/**
 * The page is one table of everything a Keyman deals with, and the cards along
 * the top choose which slice of it is on screen. Room checks are what the job
 * is about, so that is where it opens.
 */
const FILTERS = [
  {
    key: "checks",
    label: "Rooms to check",
    hint: "Oldest first. Each one waits for a Keyman before the visit is fully closed.",
    empty: "No rooms waiting. You will see one here as soon as a worker signs out.",
  },
  {
    key: "active",
    label: "Active requests",
    hint: "Approved visits the worker has not signed out of yet, with their time frame.",
    empty: "No approved visits are open.",
  },
  {
    key: "onsite",
    label: "On site now",
    hint: "Approved visits where the worker has clocked in and not left.",
    empty: "Nobody is clocked in right now.",
  },
  {
    key: "rejected",
    label: "Rejected room leaves",
    hint: "Room checks sent back to the worker, with the reason given.",
    empty: "No room leave has been rejected.",
  },
  {
    key: "all",
    label: "All",
    hint: "Every room check and open visit, newest activity first within each group.",
    empty: "Nothing to show yet.",
  },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

/**
 * One shape for the three things the table mixes: a room check waiting for a
 * decision, an open visit, and a check that has already been signed off.
 */
type KeymanRow = {
  key: string;
  kind: "check" | "visit" | "decided";
  onSite: boolean;
  accessRequestId: number;
  worker: string;
  company: string;
  location: string;
  workType: string;
  start: string | null;
  end: string | null;
  status: string;
  at: string | null;
  reason: string;
  review: RoomLeaveReview | null;
};

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

function companyFor(data: StaffData, workerId: number) {
  return data.workers.find((w) => w.id === workerId)?.companyName ?? "";
}

function buildRows(data: StaffData, reviews: RoomLeaveReview[]): KeymanRow[] {
  const checks = reviews
    .filter((r) => r.status === "Pending")
    // Oldest first: the room that has been waiting longest is the one to do next.
    .sort((a, b) => String(a.requestedAt ?? "").localeCompare(String(b.requestedAt ?? "")))
    .map<KeymanRow>((r) => ({
      key: `check-${r.id}`,
      kind: "check",
      onSite: false,
      accessRequestId: r.accessRequestId,
      worker: reviewWorker(r, data),
      company: r.companyName ?? "",
      location: reviewRoom(r, data),
      workType: r.workType ?? "",
      start: r.workFrom || r.clockedInAt || null,
      end: r.workTo ?? null,
      status: "Waiting",
      at: r.clockedOutAt || r.requestedAt,
      reason: "",
      review: r,
    }));

  const visits = activeRequests(data).map<KeymanRow>((r) => {
    const span = visitSpan(r);
    const onSite = Boolean(r.clockedInAt);
    const derived = displayStatus(r, data.approvals);
    return {
      key: `visit-${r.id}`,
      kind: "visit",
      onSite,
      accessRequestId: r.id,
      worker: workerLabel(data, r.workerId, r),
      company: companyFor(data, r.workerId),
      location: r.locationLabel || roomLabel(data, r.roomId),
      workType: r.workType ?? "",
      start: span.start,
      end: span.end,
      status: onSite && derived === "Active" ? "On site" : derived,
      at: r.clockedInAt,
      reason: "",
      review: null,
    };
  });

  const decided = reviews
    .filter((r) => r.status !== "Pending")
    .sort((a, b) => String(b.reviewedAt ?? "").localeCompare(String(a.reviewedAt ?? "")))
    .map<KeymanRow>((r) => ({
      key: `decided-${r.id}`,
      kind: "decided",
      onSite: false,
      accessRequestId: r.accessRequestId,
      worker: reviewWorker(r, data),
      company: r.companyName ?? "",
      location: reviewRoom(r, data),
      workType: r.workType ?? "",
      start: r.workFrom || r.clockedInAt || null,
      end: r.workTo ?? null,
      status: r.status === "Approved" ? "Room OK" : "Rejected",
      at: r.reviewedAt,
      reason: r.status === "Approved" ? "" : (r.reason ?? ""),
      review: r,
    }));

  return [...checks, ...visits, ...decided];
}

function matches(row: KeymanRow, filter: FilterKey) {
  switch (filter) {
    case "checks":
      return row.kind === "check";
    case "active":
      return row.kind === "visit";
    case "onsite":
      return row.kind === "visit" && row.onSite;
    case "rejected":
      return row.kind === "decided" && row.status === "Rejected";
    case "all":
      return true;
  }
}

function toneFor(row: KeymanRow) {
  if (row.kind === "check") return "warn" as const;
  if (row.status === "Room OK") return "ok" as const;
  if (row.status === "Rejected") return "danger" as const;
  return statusTone(row.status);
}

const CSV_COLUMNS = [
  "Category",
  "Worker",
  "Company",
  "Location",
  "Work type",
  "Start",
  "End",
  "Status",
  "Updated",
  "Reason",
];

const CATEGORY: Record<KeymanRow["kind"], string> = {
  check: "Room to check",
  visit: "Active request",
  decided: "Checked",
};

/**
 * Excel reads a cell beginning with =, +, - or @ as a formula, and the reason
 * field is free text a worker's manager typed, so those get an apostrophe in
 * front of them.
 */
function csvCell(value: string) {
  const text = value ?? "";
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function rowsToCsv(rows: KeymanRow[]) {
  const lines = [CSV_COLUMNS.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(
      [
        CATEGORY[row.kind],
        row.worker,
        row.company,
        row.location,
        row.workType,
        row.start ? whenExact(row.start) : "",
        row.end ? whenExact(row.end) : "",
        row.status,
        row.at ? whenExact(row.at) : "",
        row.reason,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n");
}

function downloadCsv(filename: string, csv: string) {
  // The BOM is what makes Excel open this as UTF-8 instead of the machine's
  // own code page, which would mangle any accented name.
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function KeymanPage() {
  const mounted = useMounted();
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => setSession(readSession()), []);
  const token = session?.token;
  const { data, error, loading } = useStaffData(token, { pollRequests: true });
  const checks = useRoomLeaveReviews(token);
  const [filter, setFilter] = useState<FilterKey>("checks");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const rows = useMemo(() => (data ? buildRows(data, checks.reviews) : []), [data, checks.reviews]);
  const shown = useMemo(() => rows.filter((r) => matches(r, filter)), [rows, filter]);
  const counts = useMemo(
    () =>
      FILTERS.reduce<Record<FilterKey, number>>(
        (acc, f) => {
          acc[f.key] = rows.filter((r) => matches(r, f.key)).length;
          return acc;
        },
        { checks: 0, active: 0, onsite: 0, rejected: 0, all: 0 },
      ),
    [rows],
  );

  if (!mounted || loading || !data || !checks.loaded) return <PageSkeleton />;

  const canReview = canReviewRoomLeave(session?.user.role);
  const current = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];

  return (
    <div className="sg-content">
      {error ? <p className="sg-error">{error}</p> : null}
      {checks.error ? <p className="sg-error">{checks.error}</p> : null}
      <p className="sg-muted">
        When a worker signs out of a room and has taken their photos, it lands here. Check the room is
        how they left it, then approve the room leave or reject it with a reason.
      </p>

      <div className="sg-stats">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`sg-stat sg-stat-filter${filter === f.key ? " is-on" : ""}`}
            aria-pressed={filter === f.key}
            onClick={() => {
              setFilter(f.key);
              setOpenKey(null);
            }}
          >
            <span>{f.label}</span>
            <div className="n">{counts[f.key]}</div>
          </button>
        ))}
      </div>

      <section className="sg-card" style={{ display: "grid", gap: 14 }}>
        <div className="sg-section-head">
          <div>
            <h2>{current.label}</h2>
            <p className="sg-muted">{current.hint}</p>
          </div>
          <Button
            disabled={shown.length === 0}
            onClick={() =>
              downloadCsv(
                `keyman-${filter}-${new Date().toISOString().slice(0, 10)}.csv`,
                rowsToCsv(shown),
              )
            }
          >
            <Download size={14} /> Export CSV
          </Button>
        </div>

        {!canReview ? (
          <p className="sg-help">You can see room checks, but only a Keyman or an Admin can sign them off.</p>
        ) : null}

        {shown.length === 0 ? (
          <p className="sg-muted">{current.empty}</p>
        ) : (
          <div className="sg-table-wrap">
            <table className="sg-table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Location</th>
                  <th>Start – end</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const open = openKey === row.key;
                  return (
                    <Fragment key={row.key}>
                      <tr>
                        <td>
                          <Link to="/app/requests/$id" params={{ id: String(row.accessRequestId) }}>
                            {row.worker}
                          </Link>
                          {row.company || row.workType ? (
                            <div className="sg-muted">
                              {[row.company, row.workType].filter(Boolean).join(" · ")}
                            </div>
                          ) : null}
                        </td>
                        <td>{row.location}</td>
                        <td className="sg-mono">{timeRange(row.start, row.end)}</td>
                        <td>
                          <Badge tone={toneFor(row)}>{row.status}</Badge>
                          {row.reason ? (
                            <div className="sg-error" style={{ marginTop: 4 }}>
                              {row.reason}
                            </div>
                          ) : null}
                        </td>
                        <td>{row.at ? when(row.at) : "—"}</td>
                        <td>
                          {row.kind === "check" ? (
                            <Button size="sm" onClick={() => setOpenKey(open ? null : row.key)}>
                              <KeyRound size={13} /> {open ? "Close" : "Check room"}
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                      {open && row.review ? (
                        <tr>
                          <td colSpan={6} className="sg-row-detail">
                            <ReviewCard
                              review={row.review}
                              data={data}
                              photos={checks.photos.filter(
                                (p) => p.accessRequestId === row.accessRequestId,
                              )}
                              canReview={canReview}
                              token={token ?? ""}
                              onDone={() => {
                                setOpenKey(null);
                                void checks.reload();
                              }}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <KeymanKeys
        token={token ?? ""}
        data={data}
        canAct={canReview}
        canManage={isManagerRole(session?.user.role)}
      />
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
    <article style={{ display: "grid", gap: 12 }}>
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

      <RequestKeysCheck token={token} accessRequestId={review.accessRequestId} canAct={canReview} />

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
