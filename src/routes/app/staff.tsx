import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, Button, Field, Input, Modal, PageSkeleton, Select, toast } from "@/components/ui";
import { readSession } from "@/lib/session";
import { areaLabel, useStaffData } from "@/lib/staff-data";
import { useMounted } from "@/lib/use-mounted";
import { api } from "@/lib/api/client";
import type { User } from "@/lib/api/types";

export const Route = createFileRoute("/app/staff")({ component: StaffPage });

function StaffPage() {
  const mounted = useMounted();
  const [token, setToken] = useState<string>();
  const [edit, setEdit] = useState<Partial<User> | "new" | null>(null);
  const [assign, setAssign] = useState(false);
  useEffect(() => setToken(readSession()?.token), []);
  const { data, error, loading, reload } = useStaffData(token);

  if (!mounted || loading || !data) return <PageSkeleton />;

  return (
    <div className="sg-content">
      {error ? <p className="sg-error">{error}</p> : null}
      <div className="sg-toolbar">
        <Button variant="primary" onClick={() => setEdit("new")}>
          Add staff
        </Button>
        <Button onClick={() => setAssign(true)}>Assign manager</Button>
      </div>
      <div className="sg-table-wrap">
        <table className="sg-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id} onClick={() => setEdit(u)}>
                <td>
                  {u.firstName} {u.lastName}
                </td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>
                  <Badge tone={u.isActive ? "ok" : "muted"}>{u.isActive ? "Active" : "Off"}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="sg-card">
        <h2>Work area managers</h2>
        <div className="sg-list" style={{ marginTop: 12 }}>
          {data.managers.map((m) => {
            const u = data.users.find((x) => x.id === m.managerUserId);
            return (
              <div key={m.id} className="sg-list-item" style={{ cursor: "default" }}>
                <div>
                  <strong>
                    {u?.firstName} {u?.lastName}
                  </strong>
                  <div className="sg-muted">{areaLabel(data, m.workAreaId)}</div>
                </div>
                {m.isPrimary ? <Badge tone="accent">Primary</Badge> : <Badge>Cover</Badge>}
              </div>
            );
          })}
        </div>
      </section>
      {edit ? (
        <StaffForm
          initial={
            edit === "new"
              ? { firstName: "", lastName: "", email: "", phoneNumber: "", role: "Manager", isActive: true }
              : edit
          }
          onClose={() => setEdit(null)}
          onSave={async (values) => {
            const t = readSession()?.token;
            if (!t) return;
            if (edit === "new") await api.insertUser(t, values);
            else await api.updateUser(t, { ...(edit as User), ...values } as User);
            toast("Staff saved");
            setEdit(null);
            await reload();
          }}
        />
      ) : null}
      {assign ? (
        <AssignForm
          users={data.users}
          areas={data.areas}
          onClose={() => setAssign(false)}
          onSave={async (workAreaId, managerUserId, isPrimary) => {
            const t = readSession()?.token;
            if (!t) return;
            await api.insertWorkAreaManager(t, { workAreaId, managerUserId, isPrimary });
            toast("Manager assigned");
            setAssign(false);
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}

function StaffForm({
  initial,
  onClose,
  onSave,
}: {
  initial: Partial<User>;
  onClose: () => void;
  onSave: (v: Partial<User>) => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={initial.id ? "Edit staff" : "New staff"} onClose={onClose}>
      <div className="sg-form-grid two">
        <Field label="First name">
          <Input value={v.firstName ?? ""} onChange={(e) => setV({ ...v, firstName: e.target.value })} />
        </Field>
        <Field label="Last name">
          <Input value={v.lastName ?? ""} onChange={(e) => setV({ ...v, lastName: e.target.value })} />
        </Field>
      </div>
      <Field label="Email">
        <Input type="email" value={v.email ?? ""} onChange={(e) => setV({ ...v, email: e.target.value })} />
      </Field>
      <Field label="Phone">
        <Input value={v.phoneNumber ?? ""} onChange={(e) => setV({ ...v, phoneNumber: e.target.value })} />
      </Field>
      <Field label="Role">
        <Select value={String(v.role ?? "Manager")} onChange={(e) => setV({ ...v, role: e.target.value })}>
          <option>Admin</option>
          <option>SiteManager</option>
          <option>Manager</option>
          <option>Viewer</option>
        </Select>
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

function AssignForm({
  users,
  areas,
  onClose,
  onSave,
}: {
  users: User[];
  areas: { id: number; name: string }[];
  onClose: () => void;
  onSave: (areaId: number, userId: number, primary: boolean) => Promise<void>;
}) {
  const [areaId, setAreaId] = useState(areas[0]?.id ?? 0);
  const [userId, setUserId] = useState(users[0]?.id ?? 0);
  const [primary, setPrimary] = useState(true);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Assign work area manager" onClose={onClose}>
      <Field label="Work area">
        <Select value={String(areaId)} onChange={(e) => setAreaId(Number(e.target.value))}>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Manager">
        <Select value={String(userId)} onChange={(e) => setUserId(Number(e.target.value))}>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.firstName} {u.lastName}
            </option>
          ))}
        </Select>
      </Field>
      <label className="sg-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} />
        Primary for this area
      </label>
      <div className="sg-actions">
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onSave(areaId, userId, primary).finally(() => setBusy(false));
          }}
        >
          Assign
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}
