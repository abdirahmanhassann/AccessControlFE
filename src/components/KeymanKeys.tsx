import { Link } from "@tanstack/react-router";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound } from "lucide-react";
import { Badge, Button, Field, Input, Select, toast } from "@/components/ui";
import { announceKeysChanged, keyTone, onKeysChanged } from "@/lib/keys";
import { api } from "@/lib/api/client";
import { ApiError, type AccessRequestKey, type RoomKey } from "@/lib/api/types";
import { when, whenExact } from "@/lib/format";
import { locationDisplay } from "@/lib/location";
import type { StaffData } from "@/lib/staff-data";

type Move = "Issued" | "Returned" | "Missing";

function isLate(k: AccessRequestKey) {
  return /^issued$/i.test(String(k.status)) && k.returnBy != null && Date.parse(k.returnBy) < Date.now();
}

async function moveKey(token: string, key: AccessRequestKey, status: Move, note?: string) {
  await api.updateAccessRequestKey(token, { id: key.id, status, note });
  toast(
    status === "Issued"
      ? `${key.keyLabel} handed over`
      : status === "Returned"
        ? `${key.keyLabel} returned`
        : `${key.keyLabel} recorded as missing`,
  );
  announceKeysChanged();
}

/** Buttons for one key booking, depending on where the key is. */
function KeyActions({
  token,
  keyRow,
  canAct,
  onDone,
}: {
  token: string;
  keyRow: AccessRequestKey;
  canAct: boolean;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<Move | null>(null);
  if (!canAct) return null;
  const status = String(keyRow.status);

  async function go(next: Move) {
    setBusy(next);
    try {
      await moveKey(token, keyRow, next);
      onDone();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not update the key");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="sg-actions">
      {/^approved$/i.test(status) ? (
        <Button size="sm" variant="primary" disabled={!!busy} onClick={() => void go("Issued")}>
          {busy === "Issued" ? "Saving…" : "Hand over"}
        </Button>
      ) : null}
      {/^(issued|missing)$/i.test(status) ? (
        <Button size="sm" variant="ok" disabled={!!busy} onClick={() => void go("Returned")}>
          {busy === "Returned" ? "Saving…" : "Returned"}
        </Button>
      ) : null}
      {/^issued$/i.test(status) ? (
        <Button size="sm" variant="danger" disabled={!!busy} onClick={() => void go("Missing")}>
          {busy === "Missing" ? "Saving…" : "Missing"}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Keys on one visit, shown in the Keyman's room check. Keys still out are the
 * Keyman's cue to chase them, or to record them missing and reject the room leave.
 */
export function RequestKeysCheck({
  token,
  accessRequestId,
  canAct,
}: {
  token: string;
  accessRequestId: number;
  canAct: boolean;
}) {
  const [keys, setKeys] = useState<AccessRequestKey[]>([]);
  const load = useCallback(async () => {
    if (!token) return;
    setKeys(await api.getAccessRequestKeys(token, { accessRequestId }).catch(() => []));
  }, [token, accessRequestId]);
  useEffect(() => {
    void load();
    return onKeysChanged(() => void load());
  }, [load]);

  const relevant = keys.filter((k) => !/^(rejected|requested)$/i.test(String(k.status)));
  if (!relevant.length) return null;
  const out = relevant.filter((k) => /^(approved|issued|missing)$/i.test(String(k.status)));

  return (
    <div className={`sg-room-chip${out.some((k) => /^(issued|missing)$/i.test(String(k.status))) ? " is-warn" : ""}`}>
      <strong>
        <KeyRound size={13} /> Keys on this visit
      </strong>
      {relevant.map((k) => (
        <div key={k.id} className="sg-room-chip-head">
          <span>
            {k.keyLabel}
            {k.tagNumber ? ` (${k.tagNumber})` : ""} <Badge tone={keyTone(String(k.status))}>{String(k.status)}</Badge>
          </span>
          <KeyActions token={token} keyRow={k} canAct={canAct} onDone={() => void load()} />
        </div>
      ))}
      {out.some((k) => /^(issued|missing)$/i.test(String(k.status))) ? (
        <small>
          A key from this visit has not come back. Mark it returned when you have it, or record it missing and
          reject the room leave with the reason.
        </small>
      ) : null}
    </div>
  );
}

/** The Keyman's keys card: keys to hand out and keys still out, plus the key register. */
export function KeymanKeys({
  token,
  data,
  canAct,
  canManage,
}: {
  token: string;
  data: StaffData;
  canAct: boolean;
  canManage: boolean;
}) {
  const [outstanding, setOutstanding] = useState<AccessRequestKey[]>([]);
  const [register, setRegister] = useState<RoomKey[]>([]);
  const [tab, setTab] = useState<"out" | "register">("out");
  const [form, setForm] = useState({ areaId: "", roomId: "", label: "", tagNumber: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const [out, keys] = await Promise.all([
      api.getAccessRequestKeys(token, { outstanding: true }).catch(() => [] as AccessRequestKey[]),
      api.getKeys({ token, includeInactive: true }).catch(() => [] as RoomKey[]),
    ]);
    setOutstanding(out);
    setRegister(keys);
  }, [token]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void load();
    }, 30_000);
    const stop = onKeysChanged(() => void load());
    return () => {
      window.clearInterval(id);
      stop();
    };
  }, [load]);

  const toHandOut = outstanding.filter((k) => /^approved$/i.test(String(k.status)));
  const out = outstanding.filter((k) => /^issued$/i.test(String(k.status)));
  const missing = outstanding.filter((k) => /^missing$/i.test(String(k.status)));
  const late = out.filter(isLate);
  const roomsInArea = useMemo(
    () => data.rooms.filter((r) => String(r.workAreaId) === form.areaId),
    [data.rooms, form.areaId],
  );

  async function addKey(e: FormEvent) {
    e.preventDefault();
    if (!form.roomId || !form.label.trim()) {
      toast("Choose the room and give the key a name.");
      return;
    }
    setSaving(true);
    try {
      await api.insertKey(token, { roomId: Number(form.roomId), label: form.label.trim(), tagNumber: form.tagNumber.trim() });
      toast(`Key ${form.label.trim()} added`);
      setForm((prev) => ({ ...prev, label: "", tagNumber: "" }));
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not add the key");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(key: RoomKey, isActive: boolean) {
    try {
      await api.updateKey(token, { id: key.id, label: key.label, tagNumber: key.tagNumber, notes: key.notes, isActive });
      toast(isActive ? `${key.label} back in use` : `${key.label} retired`);
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not update the key");
    }
  }

  return (
    <section className="sg-card" style={{ display: "grid", gap: 14 }}>
      <div className="sg-section-head">
        <div>
          <h2>
            <KeyRound size={16} /> Keys
          </h2>
          <p className="sg-muted">
            {toHandOut.length} to hand out · {out.length} out
            {late.length ? ` · ${late.length} late` : ""}
            {missing.length ? ` · ${missing.length} missing` : ""}
          </p>
        </div>
        <div className="sg-actions">
          <Button size="sm" variant={tab === "out" ? "primary" : "ghost"} onClick={() => setTab("out")}>
            Keys to hand out and out
          </Button>
          <Button size="sm" variant={tab === "register" ? "primary" : "ghost"} onClick={() => setTab("register")}>
            Key register
          </Button>
        </div>
      </div>

      {tab === "out" ? (
        outstanding.length === 0 ? (
          <p className="sg-muted">No keys to hand out and none out. Approved keys appear here when a request is decided.</p>
        ) : (
          <div className="sg-table-wrap">
            <table className="sg-table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Room</th>
                  <th>Worker</th>
                  <th>Status</th>
                  <th>Return by</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {outstanding.map((k) => (
                  <tr key={k.id}>
                    <td>
                      <strong>{k.keyLabel}</strong>
                      {k.tagNumber ? <div className="sg-muted">{k.tagNumber}</div> : null}
                    </td>
                    <td>
                      {k.roomName || k.roomNumber}
                      {k.workAreaName ? <div className="sg-muted">{k.workAreaName}</div> : null}
                    </td>
                    <td>
                      <Link to="/app/requests/$id" params={{ id: String(k.accessRequestId) }}>
                        {`${k.workerFirstName} ${k.workerLastName}`.trim() || `Request #${k.accessRequestId}`}
                      </Link>
                      {k.companyName ? <div className="sg-muted">{k.companyName}</div> : null}
                    </td>
                    <td>
                      <Badge tone={isLate(k) ? "danger" : keyTone(String(k.status))}>
                        {/^missing$/i.test(String(k.status))
                          ? "Missing"
                          : isLate(k)
                            ? "Late"
                            : /^approved$/i.test(String(k.status))
                              ? "To hand out"
                              : "Out"}
                      </Badge>
                      {k.issuedAt ? <div className="sg-help">since {when(k.issuedAt)}</div> : null}
                    </td>
                    <td className="sg-mono">{whenExact(k.returnBy)}</td>
                    <td>
                      <KeyActions token={token} keyRow={k} canAct={canAct} onDone={() => void load()} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <>
          {canManage ? (
            <form onSubmit={addKey} className="sg-form-grid two">
              <Field label="Tower / area">
                <Select value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value, roomId: "" })}>
                  <option value="">Select</option>
                  {data.areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Room">
                <Select
                  value={form.roomId}
                  disabled={!form.areaId}
                  onChange={(e) => setForm({ ...form, roomId: e.target.value })}
                >
                  <option value="">Select</option>
                  {roomsInArea.map((r) => (
                    <option key={r.id} value={r.id}>
                      {locationDisplay(r)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Key name" hint="What is written on the key or its fob, e.g. 13.2-A.">
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              </Field>
              <Field label="Tag number (optional)">
                <Input value={form.tagNumber} onChange={(e) => setForm({ ...form, tagNumber: e.target.value })} />
              </Field>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? "Adding…" : "Add key"}
              </Button>
            </form>
          ) : null}
          {register.length === 0 ? (
            <p className="sg-muted">No keys registered yet. Add one above; workers can then ask for it with that room.</p>
          ) : (
            <div className="sg-table-wrap">
              <table className="sg-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Room</th>
                    <th>Where it is</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {register.map((k) => (
                    <tr key={k.id}>
                      <td>
                        <strong>{k.label}</strong>
                        {k.tagNumber ? <div className="sg-muted">{k.tagNumber}</div> : null}
                      </td>
                      <td>
                        {k.roomName || k.roomNumber}
                        {k.workAreaName ? <div className="sg-muted">{k.workAreaName}</div> : null}
                      </td>
                      <td>
                        {!k.isActive ? (
                          <Badge>Retired</Badge>
                        ) : k.heldBy ? (
                          <Badge tone="warn">With {k.heldBy}</Badge>
                        ) : (
                          <Badge tone="ok">With the Keyman</Badge>
                        )}
                      </td>
                      <td>
                        {canManage ? (
                          <Button size="sm" onClick={() => void setActive(k, !k.isActive)}>
                            {k.isActive ? "Retire" : "Back in use"}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
