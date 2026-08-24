import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, Button, Field, Input, Modal, PageSkeleton, Select, Textarea, toast } from "@/components/ui";
import { QrImage } from "@/components/QrImage";
import { readSession } from "@/lib/session";
import { areaLabel, useStaffData } from "@/lib/staff-data";
import { useMounted } from "@/lib/use-mounted";
import { api } from "@/lib/api/client";
import type { Room } from "@/lib/api/types";

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
          Add room
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
              <strong>
                {r.roomNumber} {r.name}
              </strong>
              <div className="sg-muted">
                {areaLabel(data, r.workAreaId)} · <span className="sg-mono">{r.qrCodeIdentifier}</span>
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
          initial={
            edit === "new"
              ? { workAreaId: data.areas[0]?.id ?? 0, roomNumber: "", name: "", description: "", isActive: true }
              : edit
          }
          onClose={() => setEdit(null)}
          onSave={async (values) => {
            const t = readSession()?.token;
            if (!t) return;
            if (edit === "new") {
              await api.insertRoom(t, {
                workAreaId: Number(values.workAreaId),
                roomNumber: String(values.roomNumber),
                name: String(values.name),
                description: String(values.description ?? ""),
              });
            } else {
              await api.updateRoom(t, { ...(edit as Room), ...values } as Room);
            }
            toast("Room saved");
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
            <p className="sg-muted">Scan to request access. Scan again to clock out.</p>
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
  onClose,
  onSave,
}: {
  initial: Partial<Room>;
  areas: { id: number; name: string }[];
  onClose: () => void;
  onSave: (v: Partial<Room>) => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={initial.id ? "Edit room" : "New room"} onClose={onClose}>
      <Field label="Work area">
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
      <div className="sg-form-grid two">
        <Field label="Number">
          <Input value={v.roomNumber ?? ""} onChange={(e) => setV({ ...v, roomNumber: e.target.value })} />
        </Field>
        <Field label="Name">
          <Input value={v.name ?? ""} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
      </div>
      <Field label="Description">
        <Textarea value={v.description ?? ""} onChange={(e) => setV({ ...v, description: e.target.value })} />
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
            void onSave(v).finally(() => setBusy(false));
          }}
        >
          Save
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}
