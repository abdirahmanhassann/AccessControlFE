import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, Button, Field, Input, Modal, PageSkeleton, toast } from "@/components/ui";
import { readSession } from "@/lib/session";
import { useStaffData } from "@/lib/staff-data";
import { useMounted } from "@/lib/use-mounted";
import { api } from "@/lib/api/client";
import type { Site } from "@/lib/api/types";

export const Route = createFileRoute("/app/sites")({ component: SitesPage });

function SitesPage() {
  const mounted = useMounted();
  const [token, setToken] = useState<string>();
  const [edit, setEdit] = useState<Partial<Site> | "new" | null>(null);
  useEffect(() => setToken(readSession()?.token), []);
  const { data, error, loading, reload } = useStaffData(token);

  if (!mounted || loading || !data) return <PageSkeleton />;

  return (
    <div className="sg-content">
      {error ? <p className="sg-error">{error}</p> : null}
      <div className="sg-toolbar">
        <Button variant="primary" onClick={() => setEdit("new")}>
          Add site
        </Button>
      </div>
      <div className="sg-list">
        {data.sites.map((s) => (
          <button key={s.id} className="sg-list-item" onClick={() => setEdit(s)}>
            <div>
              <strong>{s.name}</strong>
              <div className="sg-muted">
                {s.address} · <span className="sg-mono">{s.reference}</span>
              </div>
            </div>
            <Badge tone={s.isActive ? "ok" : "muted"}>{s.isActive ? "Active" : "Off"}</Badge>
          </button>
        ))}
      </div>
      {edit ? (
        <SiteForm
          initial={edit === "new" ? { name: "", address: "", reference: "", isActive: true } : edit}
          onClose={() => setEdit(null)}
          onSave={async (values) => {
            const t = readSession()?.token;
            if (!t) return;
            if (edit === "new") await api.insertSite(t, values as { name: string; address: string; reference: string });
            else await api.updateSite(t, { ...(edit as Site), ...values });
            toast("Site saved");
            setEdit(null);
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}

function SiteForm({
  initial,
  onClose,
  onSave,
}: {
  initial: Partial<Site>;
  onClose: () => void;
  onSave: (v: Partial<Site>) => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={initial.id ? "Edit site" : "New site"} onClose={onClose}>
      <Field label="Name">
        <Input value={v.name ?? ""} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <Field label="Address">
        <Input value={v.address ?? ""} onChange={(e) => setV({ ...v, address: e.target.value })} />
      </Field>
      <Field label="Reference">
        <Input value={v.reference ?? ""} onChange={(e) => setV({ ...v, reference: e.target.value })} />
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
