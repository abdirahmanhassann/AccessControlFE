import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button, Field, Input, PageSkeleton, Select, toast } from "@/components/ui";
import { readSession } from "@/lib/session";
import { useStaffData } from "@/lib/staff-data";
import { useMounted } from "@/lib/use-mounted";
import { api } from "@/lib/api/client";
import type {
  Department,
  DepartmentManagerMapping,
  DepartmentRoomMapping,
} from "@/lib/api/types";

export const Route = createFileRoute("/app/departments")({ component: DepartmentsPage });

function DepartmentsPage() {
  const mounted = useMounted();
  const [token, setToken] = useState<string>();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roomsMap, setRoomsMap] = useState<DepartmentRoomMapping[]>([]);
  const [managersMap, setManagersMap] = useState<DepartmentManagerMapping[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSiteId, setNewSiteId] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  useEffect(() => setToken(readSession()?.token), []);
  const { data, loading } = useStaffData(token);

  async function reloadMaps(t: string, preferId?: number) {
    const [deps, rooms, managers] = await Promise.all([
      api.getDepartments(t),
      api.getDepartmentRoomMappings(t),
      api.getDepartmentManagerMappings(t),
    ]);
    setDepartments(deps);
    setRoomsMap(rooms);
    setManagersMap(managers);
    if (preferId && deps.some((d) => d.id === preferId)) {
      setSelected(preferId);
    } else if (selected == null && deps[0]) {
      setSelected(deps[0].id);
    } else if (selected != null && !deps.some((d) => d.id === selected) && deps[0]) {
      setSelected(deps[0].id);
    }
  }

  useEffect(() => {
    if (!token) return;
    void reloadMaps(token).catch((err) =>
      toast(err instanceof Error ? err.message : "Could not load departments"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!data?.sites?.length) return;
    if (!newSiteId) setNewSiteId(String(data.sites[0].id));
  }, [data?.sites, newSiteId]);

  const dept = departments.find((d) => d.id === selected) ?? null;
  const rooms = useMemo(
    () => roomsMap.filter((m) => m.departmentId === selected),
    [roomsMap, selected],
  );
  const managers = useMemo(
    () => managersMap.filter((m) => m.departmentId === selected),
    [managersMap, selected],
  );

  if (!mounted || loading || !data) return <PageSkeleton />;

  async function createDepartment() {
    const t = readSession()?.token;
    const name = newName.trim();
    const siteId = Number(newSiteId);
    if (!t || !name || !siteId) {
      toast("Choose a site and enter a department name.");
      return;
    }
    setBusy(true);
    try {
      await api.insertDepartment(t, {
        siteId,
        name,
        description: newDescription.trim() || undefined,
      });
      const deps = await api.getDepartments(t);
      setDepartments(deps);
      const created =
        deps.find(
          (d) =>
            d.siteId === siteId &&
            d.name.trim().toLowerCase() === name.toLowerCase(),
        ) ?? deps[deps.length - 1];
      await reloadMaps(t, created?.id);
      setNewName("");
      setNewDescription("");
      setShowCreate(false);
      toast(`Created ${name}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not create department");
    } finally {
      setBusy(false);
    }
  }

  async function add(kind: "room" | "manager", value: number) {
    const t = readSession()?.token;
    if (!t || !selected || !value) return;
    setBusy(true);
    try {
      if (kind === "room") await api.insertDepartmentRoomMapping(t, { departmentId: selected, roomId: value });
      if (kind === "manager") {
        await api.insertDepartmentManagerMapping(t, {
          departmentId: selected,
          userId: value,
          isPrimary: false,
        });
      }
      await reloadMaps(t);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add mapping");
    } finally {
      setBusy(false);
    }
  }

  async function remove(kind: "room" | "manager", id: number) {
    const t = readSession()?.token;
    if (!t) return;
    setBusy(true);
    try {
      if (kind === "room") await api.deleteDepartmentRoomMapping(t, id);
      if (kind === "manager") await api.deleteDepartmentManagerMapping(t, id);
      await reloadMaps(t);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not remove mapping");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sg-content">
      <p className="sg-muted">
        A manager only appears on the worker dropdown, and can only approve, when they are mapped to a
        department that owns the room <em>and</em> that department belongs to the room's site.
        Workers can request any room.
      </p>

      <div className="sg-card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="sg-actions" style={{ justifyContent: "space-between", marginBottom: showCreate ? 12 : 0 }}>
          <strong>Departments</strong>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "New department"}
          </Button>
        </div>
        {showCreate ? (
          <div className="sg-form-grid" style={{ gap: 12 }}>
            <Field label="Site">
              <Select value={newSiteId} onChange={(e) => setNewSiteId(e.target.value)}>
                <option value="">Select site</option>
                {data.sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Name">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Mechanical"
                maxLength={200}
              />
            </Field>
            <Field label="Description (optional)">
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What this department covers"
                maxLength={500}
              />
            </Field>
            <Button
              variant="primary"
              disabled={busy || !newName.trim() || !newSiteId}
              onClick={() => void createDepartment()}
            >
              {busy ? "Saving…" : "Create department"}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="sg-toolbar">
        <Select value={String(selected ?? "")} onChange={(e) => setSelected(Number(e.target.value))}>
          <option value="">Select department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} {d.siteName ? `· ${d.siteName}` : ""}
            </option>
          ))}
        </Select>
      </div>
      {!dept ? (
        <p className="sg-empty">
          No departments yet. Use <strong>New department</strong> above, or seed from work areas via
          Database/Mappings.sql.
        </p>
      ) : (
        <div className="sg-list">
          <MappingBlock
            title="Rooms"
            hint="Rooms this department can approve access for."
            rows={rooms.map((m) => ({
              id: m.id,
              label: `${m.roomNumber ?? `#${m.roomId}`} ${m.roomName ?? ""}`.trim(),
            }))}
            options={data.rooms
              .filter((r) => !rooms.some((m) => m.roomId === r.id))
              .map((r) => ({ id: r.id, label: `${r.roomNumber} ${r.name}` }))}
            onAdd={(id) => add("room", id)}
            onRemove={(id) => remove("room", id)}
            busy={busy}
          />
          <MappingBlock
            title="Managers"
            hint="Only these staff appear on the approve dropdown for mapped rooms."
            rows={managers.map((m) => ({
              id: m.id,
              label: `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || `User #${m.userId}`,
            }))}
            options={data.users
              .filter(
                (u) =>
                  /manager|admin/i.test(String(u.role)) &&
                  !managers.some((m) => m.userId === u.id),
              )
              .map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName} · ${u.role}` }))}
            onAdd={(id) => add("manager", id)}
            onRemove={(id) => remove("manager", id)}
            busy={busy}
          />
        </div>
      )}
    </div>
  );
}

function MappingBlock({
  title,
  hint,
  rows,
  options,
  onAdd,
  onRemove,
  busy,
}: {
  title: string;
  hint: string;
  rows: { id: number; label: string }[];
  options: { id: number; label: string }[];
  onAdd: (id: number) => void;
  onRemove: (id: number) => void;
  busy: boolean;
}) {
  const [pick, setPick] = useState("");
  return (
    <div className="sg-card" style={{ padding: 16 }}>
      <strong>{title}</strong>
      <p className="sg-muted">{hint}</p>
      <div className="sg-actions" style={{ margin: "12px 0" }}>
        <Select value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Add…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          variant="primary"
          disabled={busy || !pick}
          onClick={() => {
            onAdd(Number(pick));
            setPick("");
          }}
        >
          Add
        </Button>
      </div>
      {rows.length === 0 ? <p className="sg-help">None mapped.</p> : null}
      {rows.map((r) => (
        <div key={r.id} className="sg-list-item">
          <span>{r.label}</span>
          <Button size="sm" variant="danger" disabled={busy} onClick={() => onRemove(r.id)}>
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}
