import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, Button, Field, Input, Modal, PageSkeleton, Select, toast } from "@/components/ui";
import { readSession } from "@/lib/session";
import { useStaffData } from "@/lib/staff-data";
import { useMounted } from "@/lib/use-mounted";
import { prettyPhone } from "@/lib/format";
import { api } from "@/lib/api/client";
import type { Site, Worker, WorkerSiteMapping } from "@/lib/api/types";

export const Route = createFileRoute("/app/workers")({ component: WorkersPage });

function WorkersPage() {
  const mounted = useMounted();
  const [token, setToken] = useState<string>();
  const [edit, setEdit] = useState<Partial<Worker> | "new" | null>(null);
  useEffect(() => setToken(readSession()?.token), []);
  const { data, error, loading, reload } = useStaffData(token);

  if (!mounted || loading || !data) return <PageSkeleton />;

  return (
    <div className="sg-content">
      {error ? <p className="sg-error">{error}</p> : null}
      <p className="sg-muted">
        Workers are contractors in the Workers table. They request room access. They are not managers.
      </p>
      <div className="sg-toolbar">
        <Button variant="primary" onClick={() => setEdit("new")}>
          Add worker
        </Button>
      </div>
      <div className="sg-table-wrap">
        <table className="sg-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Company</th>
              <th>Phone</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.workers.map((w) => (
              <tr key={w.id} onClick={() => setEdit(w)}>
                <td>
                  {w.firstName} {w.lastName}
                </td>
                <td>{w.companyName}</td>
                <td className="sg-mono">{prettyPhone(w.phoneNumber)}</td>
                <td>
                  <Badge tone={w.isActive ? "ok" : "muted"}>{w.isActive ? "Active" : "Off"}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit ? (
        <WorkerForm
          sites={data.sites}
          initial={
            edit === "new"
              ? { firstName: "", lastName: "", phoneNumber: "", companyName: "", isActive: true }
              : edit
          }
          onClose={() => setEdit(null)}
          onSave={async (values) => {
            const t = readSession()?.token;
            if (edit === "new") {
              await api.insertWorker({
                firstName: String(values.firstName),
                lastName: String(values.lastName),
                phoneNumber: String(values.phoneNumber),
                companyName: String(values.companyName),
              });
            } else if (t) {
              await api.updateWorker(t, { ...(edit as Worker), ...values } as Worker);
            }
            toast("Worker saved");
            setEdit(null);
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}

function WorkerForm({
  initial,
  sites,
  onClose,
  onSave,
}: {
  initial: Partial<Worker>;
  sites: Site[];
  onClose: () => void;
  onSave: (v: Partial<Worker>) => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [siteMaps, setSiteMaps] = useState<WorkerSiteMapping[]>([]);
  const [pick, setPick] = useState("");

  useEffect(() => {
    const t = readSession()?.token;
    if (!t || !initial.id) return;
    void api.getWorkerSiteMappings(t).then((rows) => setSiteMaps(rows.filter((r) => r.workerId === initial.id)));
  }, [initial.id]);

  async function addSite() {
    const t = readSession()?.token;
    if (!t || !initial.id || !pick) return;
    await api.insertWorkerSiteMapping(t, { workerId: initial.id, siteId: Number(pick) });
    const rows = await api.getWorkerSiteMappings(t);
    setSiteMaps(rows.filter((r) => r.workerId === initial.id));
    setPick("");
  }

  async function removeSite(id: number) {
    const t = readSession()?.token;
    if (!t) return;
    await api.deleteWorkerSiteMapping(t, id);
    setSiteMaps((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <Modal title={initial.id ? "Edit worker" : "New worker"} onClose={onClose}>
      <div className="sg-form-grid two">
        <Field label="First name">
          <Input value={v.firstName ?? ""} onChange={(e) => setV({ ...v, firstName: e.target.value })} />
        </Field>
        <Field label="Last name">
          <Input value={v.lastName ?? ""} onChange={(e) => setV({ ...v, lastName: e.target.value })} />
        </Field>
      </div>
      <Field label="Phone">
        <Input value={v.phoneNumber ?? ""} onChange={(e) => setV({ ...v, phoneNumber: e.target.value })} />
      </Field>
      <Field label="Company">
        <Input value={v.companyName ?? ""} onChange={(e) => setV({ ...v, companyName: e.target.value })} />
      </Field>
      {initial.id ? (
        <>
          <label className="sg-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={v.isActive !== false}
              onChange={(e) => setV({ ...v, isActive: e.target.checked })}
            />
            Active
          </label>
          <Field label="Sites this worker can request access on">
            <div className="sg-actions">
              <Select value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Add site…</option>
                {sites
                  .filter((s) => !siteMaps.some((m) => m.siteId === s.id))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
              <Button size="sm" disabled={!pick} onClick={() => void addSite()}>
                Add
              </Button>
            </div>
            {siteMaps.map((m) => (
              <div key={m.id} className="sg-list-item">
                <span>{m.siteName || sites.find((s) => s.id === m.siteId)?.name || `Site #${m.siteId}`}</span>
                <Button size="sm" variant="danger" onClick={() => void removeSite(m.id)}>
                  Remove
                </Button>
              </div>
            ))}
          </Field>
        </>
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
