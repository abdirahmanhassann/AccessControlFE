import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, Button, Field, Input, Modal, PageSkeleton, Select, toast } from "@/components/ui";
import { readSession } from "@/lib/session";
import { areaLabel, useStaffData } from "@/lib/staff-data";
import { useMounted } from "@/lib/use-mounted";
import { DAY_NAMES, type AccessWindow } from "@/lib/api/types";
import { timeSpan } from "@/lib/format";
import { api } from "@/lib/api/client";

export const Route = createFileRoute("/app/hours")({ component: HoursPage });

function HoursPage() {
  const mounted = useMounted();
  const [token, setToken] = useState<string>();
  const [edit, setEdit] = useState<Partial<AccessWindow> | "new" | null>(null);
  useEffect(() => setToken(readSession()?.token), []);
  const { data, error, loading, reload } = useStaffData(token);

  if (!mounted || loading || !data) return <PageSkeleton />;

  return (
    <div className="sg-content">
      {error ? <p className="sg-error">{error}</p> : null}
      <div className="sg-toolbar">
        <Button variant="primary" onClick={() => setEdit("new")}>
          Add window
        </Button>
      </div>
      <div className="sg-table-wrap">
        <table className="sg-table">
          <thead>
            <tr>
              <th>Work area</th>
              <th>Day</th>
              <th>Start</th>
              <th>End</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.windows.map((w) => (
              <tr key={w.id} onClick={() => setEdit(w)}>
                <td>{areaLabel(data, w.workAreaId)}</td>
                <td>{DAY_NAMES[w.dayOfWeek] ?? w.dayOfWeek}</td>
                <td className="sg-mono">{timeSpan(w.startTime)}</td>
                <td className="sg-mono">{timeSpan(w.endTime)}</td>
                <td>
                  <Badge tone={w.isActive ? "ok" : "muted"}>{w.isActive ? "On" : "Off"}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit ? (
        <WindowForm
          areas={data.areas}
          initial={
            edit === "new"
              ? {
                  workAreaId: data.areas[0]?.id ?? 0,
                  dayOfWeek: 1,
                  startTime: "07:00:00",
                  endTime: "18:00:00",
                  isActive: true,
                }
              : edit
          }
          onClose={() => setEdit(null)}
          onSave={async (values) => {
            const t = readSession()?.token;
            if (!t) return;
            if (edit === "new") {
              await api.insertAccessWindow(t, {
                workAreaId: Number(values.workAreaId),
                dayOfWeek: Number(values.dayOfWeek),
                startTime: String(values.startTime),
                endTime: String(values.endTime),
              });
            } else {
              await api.updateAccessWindow(t, { ...(edit as AccessWindow), ...values } as AccessWindow);
            }
            toast("Access window saved");
            setEdit(null);
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}

function WindowForm({
  initial,
  areas,
  onClose,
  onSave,
}: {
  initial: Partial<AccessWindow>;
  areas: { id: number; name: string }[];
  onClose: () => void;
  onSave: (v: Partial<AccessWindow>) => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={initial.id ? "Edit window" : "New window"} onClose={onClose}>
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
      <Field label="Day">
        <Select value={String(v.dayOfWeek ?? 1)} onChange={(e) => setV({ ...v, dayOfWeek: Number(e.target.value) })}>
          {DAY_NAMES.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </Select>
      </Field>
      <div className="sg-form-grid two">
        <Field label="Start">
          <Input
            type="time"
            value={(v.startTime ?? "07:00:00").slice(0, 5)}
            onChange={(e) => setV({ ...v, startTime: `${e.target.value}:00` })}
          />
        </Field>
        <Field label="End">
          <Input
            type="time"
            value={(v.endTime ?? "18:00:00").slice(0, 5)}
            onChange={(e) => setV({ ...v, endTime: `${e.target.value}:00` })}
          />
        </Field>
      </div>
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
