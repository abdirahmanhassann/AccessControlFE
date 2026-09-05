import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, Button, Field, Input, Modal, PageSkeleton, Select, Textarea, toast } from "@/components/ui";
import { QrImage } from "@/components/QrImage";
import { readSession } from "@/lib/session";
import { areaLabel, useStaffData } from "@/lib/staff-data";
import { useMounted } from "@/lib/use-mounted";
import { api } from "@/lib/api/client";
import type { Room, RoomManager, User } from "@/lib/api/types";
import { LOCATION_KINDS, locationDisplay } from "@/lib/location";

export const Route = createFileRoute("/app/rooms")({ component: RoomsPage });

function RoomsPage() {
  const mounted = useMounted();
  const [token, setToken] = useState<string>();
  const [edit, setEdit] = useState<Partial<Room> | "new" | null>(null);
  const [poster, setPoster] = useState<Room | null>(null);
  useEffect(() => setToken(readSession()?.token), []);
  const { data, error, loading, reload } = useStaffData(token);

  if (!mounted || loading || !data) return <PageSkeleton />;

  return (
    <div className="sg-content">
      {error ? <p className="sg-error">{error}</p> : null}
      <div className="sg-toolbar">
        <Button variant="primary" onClick={() => setEdit("new")}>
          Add location
        </Button>
      </div>
      <div className="sg-list">
        {data.rooms.map((r) => (
          <div key={r.id} className="sg-list-item" style={{ gridTemplateColumns: "64px 1fr auto", cursor: "default" }}>
            <QrImage value={r.qrCodeIdentifier} size={64} />
            <button
              onClick={() => setEdit(r)}
              style={{ background: "none", border: 0, textAlign: "left", padding: 0 }}
            >
              <strong>{locationDisplay(r)}</strong>
              <div className="sg-muted">
                {areaLabel(data, r.workAreaId)} · {r.locationKind || "Apartment"}
                {data.roomManagers
                  .filter((m) => m.roomId === r.id)
                  .map((m) => data.users.find((u) => u.id === m.managerUserId))
                  .filter(Boolean)
                  .map((u) => ` · ${u!.firstName} ${u!.lastName}`)
                  .join("")}
              </div>
            </button>
            <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
              <Badge tone={r.isActive ? "ok" : "muted"}>{r.isActive ? "Active" : "Off"}</Badge>
              <Button size="sm" onClick={() => setPoster(r)}>
                Poster
              </Button>
            </div>
          </div>
        ))}
      </div>
      {edit ? (
        <RoomForm
          areas={data.areas}
          users={data.users.filter((u) => /^(admin|sitemanager|manager)$/i.test(String(u.role)))}
          assigned={data.roomManagers.find((m) => m.roomId === (edit === "new" ? 0 : edit.id) && m.isPrimary) ?? data.roomManagers.find((m) => m.roomId === (edit === "new" ? 0 : edit.id))}
          initial={
            edit === "new"
              ? { workAreaId: data.areas[0]?.id ?? 0, roomNumber: "", name: "", description: "", locationKind: "Apartment", isActive: true }
              : edit
          }
          onClose={() => setEdit(null)}
          onSave={async (values, managerUserId) => {
            const t = readSession()?.token;
            if (!t) return;
            let roomId = edit === "new" ? 0 : (edit as Room).id;
            if (edit === "new") {
              const created = await api.insertRoom(t, {
                workAreaId: Number(values.workAreaId),
                roomNumber: String(values.roomNumber),
                name: String(values.name),
                description: String(values.description ?? ""),
                locationKind: String(values.locationKind || "Apartment"),
              });
              roomId = created?.id ?? 0;
            } else {
              await api.updateRoom(t, { ...(edit as Room), ...values } as Room);
            }
            if (roomId && managerUserId) {
              const existing = data.roomManagers.find((m) => m.roomId === roomId);
              try {
                if (existing) {
                  await api.updateRoomManager(t, {
                    id: existing.id,
                    roomId,
                    managerUserId,
                    isPrimary: true,
                  });
                } else {
                  await api.insertRoomManager(t, { roomId, managerUserId, isPrimary: true });
                }
              } catch {
                /* live API may not expose location-manager endpoints yet */
              }
            }
            toast("Location saved");
            setEdit(null);
            await reload();
          }}
        />
      ) : null}
      {poster ? (
        <Modal title="Printable QR" onClose={() => setPoster(null)}>
          <div className="sg-qr-poster">
            <p className="sg-label">SiteGate</p>
            <QrImage value={poster.qrCodeIdentifier} size={220} />
            <h2>
              {poster.roomNumber}
              <br />
              {poster.name}
            </h2>
            <p className="sg-mono">{poster.qrCodeIdentifier}</p>
            <p className="sg-muted">Scan the site gate QR to request access. Workers pick this location on the form.</p>
            <Button onClick={() => window.print()}>Print</Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function RoomForm({
  initial,
  areas,
  users,
  assigned,
  onClose,
  onSave,
}: {
  initial: Partial<Room>;
  areas: { id: number; name: string }[];
  users: User[];
  assigned?: RoomManager;
  onClose: () => void;
  onSave: (v: Partial<Room>, managerUserId?: number) => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [managerUserId, setManagerUserId] = useState(assigned ? String(assigned.managerUserId) : "");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={initial.id ? "Edit location" : "New location"} onClose={onClose}>
      <Field label="Tower">
        <Select
          value={String(v.workAreaId ?? "")}
          onChange={(e) => setV({ ...v, workAreaId: Number(e.target.value) })}
        >
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Kind">
        <Select
          value={String(v.locationKind || "Apartment")}
          onChange={(e) => setV({ ...v, locationKind: e.target.value })}
        >
          {LOCATION_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
      </Field>
      <div className="sg-form-grid two">
        <Field label="Code">
          <Input
            value={v.roomNumber ?? ""}
            onChange={(e) => setV({ ...v, roomNumber: e.target.value })}
            placeholder="13.2 or E2.00.21"
          />
        </Field>
        <Field label="Name">
          <Input value={v.name ?? ""} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
      </div>
      <Field label="Description">
        <Textarea value={v.description ?? ""} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </Field>
      <Field label="Location manager" hint="This is the person workers pick when they request this apartment or riser.">
        <Select value={managerUserId} onChange={(e) => setManagerUserId(e.target.value)}>
          <option value="">Select manager</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {`${u.firstName} ${u.lastName}`.trim() || u.email}
            </option>
          ))}
        </Select>
      </Field>
      {initial.qrCodeIdentifier ? (
        <Field label="QR identifier">
          <Input
            value={v.qrCodeIdentifier ?? ""}
            onChange={(e) => setV({ ...v, qrCodeIdentifier: e.target.value })}
          />
        </Field>
      ) : null}
      {initial.id ? (
        <label className="sg-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={v.isActive !== false}
            onChange={(e) => setV({ ...v, isActive: e.target.checked })}
          />
          Active
        </label>
      ) : null}
      <div className="sg-actions">
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onSave(v, managerUserId ? Number(managerUserId) : undefined).finally(() => setBusy(false));
          }}
        >
          Save
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

