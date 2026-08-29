import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Field, PageSkeleton, Select, toast } from "@/components/ui";
import { readSession } from "@/lib/session";
import { useStaffData } from "@/lib/staff-data";
import { useMounted } from "@/lib/use-mounted";
import { api } from "@/lib/api/client";
import type {
  Department,
  DepartmentManagerMapping,
  DepartmentRoomMapping,
  DepartmentWorkerMapping,
} from "@/lib/api/types";

export const Route = createFileRoute("/app/departments")({ component: DepartmentsPage });

function DepartmentsPage() {
  const mounted = useMounted();
  const [token, setToken] = useState<string>();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roomsMap, setRoomsMap] = useState<DepartmentRoomMapping[]>([]);
  const [workersMap, setWorkersMap] = useState<DepartmentWorkerMapping[]>([]);
  const [managersMap, setManagersMap] = useState<DepartmentManagerMapping[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setToken(readSession()?.token), []);
  const { data, loading } = useStaffData(token);

  async function reloadMaps(t: string) {
    const [deps, rooms, workers, managers] = await Promise.all([
      api.getDepartments(t),
      api.getDepartmentRoomMappings(t),
      api.getDepartmentWorkerMappings(t),
      api.getDepartmentManagerMappings(t),
    ]);
    setDepartments(deps);
    setRoomsMap(rooms);
    setWorkersMap(workers);
    setManagersMap(managers);
    if (selected == null && deps[0]) setSelected(deps[0].id);
  }

  useEffect(() => {
    if (!token) return;
    void reloadMaps(token).catch((err) => toast(err instanceof Error ? err.message : "Could not load departments"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const dept = departments.find((d) => d.id === selected) ?? null;
  const rooms = useMemo(() => roomsMap.filter((m) => m.departmentId === selected), [roomsMap, selected]);
  const workers = useMemo(() => workersMap.filter((m) => m.departmentId === selected), [workersMap, selected]);
  const managers = useMemo(() => managersMap.filter((m) => m.departmentId === selected), [managersMap, selected]);

  if (!mounted || loading || !data) return <PageSkeleton />;

  async function add(kind: "room" | "worker" | "manager", value: number) {
    const t = readSession()?.token;
    if (!t || !selected || !value) return;
    setBusy(true);
    try {
      if (kind === "room") await api.insertDepartmentRoomMapping(t, { departmentId: selected, roomId: value });
      if (kind === "worker") await api.insertDepartmentWorkerMapping(t, { departmentId: selected, workerId: value });
      if (kind === "manager") {
        await api.insertDepartmentManagerMapping(t, { departmentId: selected, userId: value, isPrimary: false });
      }
      await reloadMaps(t);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add mapping");
    } finally {
      setBusy(false);
    }
  }

  async function remove(kind: "room" | "worker" | "manager", id: number) {
    const t = readSession()?.token;
    if (!t) return;
    setBusy(true);
    try {
      if (kind === "room") await api.deleteDepartmentRoomMapping(t, id);
      if (kind === "worker") await api.deleteDepartmentWorkerMapping(t, id);
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
        Workers must be mapped to that department and to the site.
      </p>
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
        <p className="sg-empty">Run Database/Mappings.sql then refresh. Departments seed from work areas.</p>
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
            title="Workers"
            hint="Contractors who can request these rooms."
            rows={workers.map((m) => ({
              id: m.id,
              label: `${m.workerFirstName ?? ""} ${m.workerLastName ?? ""}`.trim() || `Worker #${m.workerId}`,
            }))}
            options={data.workers
              .filter((w) => !workers.some((m) => m.workerId === w.id))
              .map((w) => ({ id: w.id, label: `${w.firstName} ${w.lastName}` }))}
            onAdd={(id) => add("worker", id)}
            onRemove={(id) => remove("worker", id)}
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
              .filter((u) => /manager|admin/i.test(String(u.role)) && !managers.some((m) => m.userId === u.id))
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
