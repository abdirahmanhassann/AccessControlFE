import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, Button, Field, Input, Modal, PageSkeleton, Select, Textarea, toast } from "@/components/ui";
import { readSession } from "@/lib/session";
import { siteLabel, useStaffData, userLabel } from "@/lib/staff-data";
import { useMounted } from "@/lib/use-mounted";
import { api } from "@/lib/api/client";
import type { WorkArea } from "@/lib/api/types";

export const Route = createFileRoute("/app/areas")({ component: AreasPage });

function AreasPage() {
  const mounted = useMounted();
  const [token, setToken] = useState<string>();
  const [edit, setEdit] = useState<Partial<WorkArea> | "new" | null>(null);
  useEffect(() => setToken(readSession()?.token), []);
  const { data, error, loading, reload } = useStaffData(token);

  if (!mounted || loading || !data) return <PageSkeleton />;

  return (
    <div className="sg-content">
      {error ? <p className="sg-error">{error}</p> : null}
      <div className="sg-toolbar">
        <Button variant="primary" onClick={() => setEdit("new")}>
          Add tower
        </Button>
      </div>
      <div className="sg-list">
        {data.areas.map((a) => {
          const mgrs = data.managers.filter((m) => m.workAreaId === a.id);
          return (
            <button key={a.id} className="sg-list-item" onClick={() => setEdit(a)}>
              <div>
                <strong>{a.name}</strong>
                <div className="sg-muted">
                  {siteLabel(data, a.siteId)}
                  {mgrs.length
                    ? ` · ${mgrs.map((m) => userLabel(data, m.managerUserId)).join(", ")}`
                    : ""}
                </div>
              </div>
              <Badge tone={a.isActive ? "ok" : "muted"}>{a.isActive ? "Active" : "Off"}</Badge>
            </button>
          );
        })}
      </div>
      {edit ? (
        <AreaForm
          sites={data.sites}
          initial={
            edit === "new"
              ? { siteId: data.sites[0]?.id ?? 0, name: "", description: "", isActive: true }
              : edit
          }
          onClose={() => setEdit(null)}
          onSave={async (values) => {
            const t = readSession()?.token;
            if (!t) return;
            if (edit === "new") {
              await api.insertWorkArea(t, {
                siteId: Number(values.siteId),
                name: String(values.name),
                description: String(values.description ?? ""),
              });
            } else {
              await api.updateWorkArea(t, { ...(edit as WorkArea), ...values } as WorkArea);
            }
            toast("Tower saved");
            setEdit(null);
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}

function AreaForm({
  initial,
  sites,
  onClose,
  onSave,
}: {
  initial: Partial<WorkArea>;
  sites: { id: number; name: string }[];
  onClose: () => void;
  onSave: (v: Partial<WorkArea>) => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={initial.id ? "Edit tower" : "New tower"} onClose={onClose}>
      <Field label="Site">
        <Select value={String(v.siteId ?? "")} onChange={(e) => setV({ ...v, siteId: Number(e.target.value) })}>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Name">
        <Input value={v.name ?? ""} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <Field label="Description">
        <Textarea value={v.description ?? ""} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </Field>
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
