import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button, Field, Input, PageSkeleton, toast } from "@/components/ui";
import { readSession } from "@/lib/session";
import { useMounted } from "@/lib/use-mounted";
import { api } from "@/lib/api/client";
import { ApiError, type AppSettings, type Session } from "@/lib/api/types";

export const Route = createFileRoute("/app/settings")({ component: SettingsPage });

const BLANK: AppSettings = { autoBlockOverdueCount: 0, autoBlockPhotoRejectedCount: 0 };

function SettingsPage() {
  const mounted = useMounted();
  const [session, setSession] = useState<Session | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [form, setForm] = useState<AppSettings>(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setSession(readSession()), []);

  const token = session?.token;
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void api
      .getSettings(token)
      .then((loaded) => {
        if (cancelled) return;
        setSettings(loaded);
        setForm(loaded);
        setError("");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSettings(BLANK);
        setError(err instanceof ApiError ? err.message : "Could not load settings");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!mounted || !settings) return <PageSkeleton />;

  // Only an Admin can save; everyone else sees the numbers read-only.
  const isAdmin = (session?.user.role ?? "").toLowerCase() === "admin";

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (form.autoBlockOverdueCount < 0 || form.autoBlockPhotoRejectedCount < 0) {
      setError("A limit cannot be negative. Use 0 to turn a rule off.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.updateSettings(token, form);
      setSettings(form);
      toast("Settings saved");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save settings");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sg-content">
      {error ? <p className="sg-error">{error}</p> : null}
      <p className="sg-muted">
        How many times a worker can slip before the system blocks them. A blocked worker keeps their
        phone verification and can still sign out of a room they are already in — what they lose is
        the right to start a new access request, until a manager unblocks them on the Workers tab.
      </p>

      <form onSubmit={save} className="sg-card" style={{ display: "grid", gap: 16 }}>
        <div>
          <h2>
            <ShieldAlert size={16} /> Auto-block
          </h2>
          <p className="sg-muted">Set a limit to 0 to turn that rule off.</p>
        </div>

        <Field
          label="Late sign-outs before blocking"
          hint="Counts a visit signed out after its approved time frame had ended — in practice, one a manager had to close."
        >
          <Input
            type="number"
            min={0}
            max={99}
            inputMode="numeric"
            disabled={!isAdmin || busy}
            value={String(form.autoBlockOverdueCount)}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, autoBlockOverdueCount: Number(e.target.value) || 0 }))
            }
          />
        </Field>

        <Field
          label="Rejected room leaves before blocking"
          hint="Counts a room check a Keyman rejected, which is this system's record of a room left badly or photographed badly."
        >
          <Input
            type="number"
            min={0}
            max={99}
            inputMode="numeric"
            disabled={!isAdmin || busy}
            value={String(form.autoBlockPhotoRejectedCount)}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                autoBlockPhotoRejectedCount: Number(e.target.value) || 0,
              }))
            }
          />
        </Field>

        {isAdmin ? (
          <div className="sg-actions">
            <Button variant="primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save settings"}
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                setForm(settings!);
                setError("");
              }}
            >
              Reset
            </Button>
          </div>
        ) : (
          <p className="sg-help">Only an Admin can change these.</p>
        )}
      </form>
    </div>
  );
}
