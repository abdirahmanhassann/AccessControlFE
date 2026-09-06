import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { BrandMark, Button, Field, Input } from "@/components/ui";
import { API_BASE, USE_MOCK, api, normalizeLogin } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { writeSession, clearSession } from "@/lib/session";
import { resetDemoData } from "@/lib/api/mock";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(USE_MOCK ? "james.cole@sitegate.demo" : "");
  const [password, setPassword] = useState(USE_MOCK ? "SiteGate1!" : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.login({ email, password });
      writeSession(normalizeLogin(result));
      await navigate({ to: "/app" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sg-auth">
      <div className="sg-auth-art">
        <BrandMark light />
        <div>
          <p className="sg-kicker" style={{ color: "#d5e4e1" }}>
            Site managers
          </p>
          <h1>Approve the door from your desk — or the gantry.</h1>
        </div>
        <p className="sg-muted" style={{ color: "#b7c4c1", position: "relative" }}>
          Pending requests land here. Approve, reject, and the worker gets an SMS.
        </p>
      </div>
      <div className="sg-auth-form">
        <form className="sg-auth-card" onSubmit={onSubmit}>
          <BrandMark />
          <div>
            <h1 style={{ fontSize: "1.6rem", marginBottom: 6 }}>Sign in</h1>
            <p className="sg-muted">Staff console for sites, rooms, and access.</p>
          </div>
          {USE_MOCK ? (
            <div className="sg-demo">
              Demo · password <code>SiteGate1!</code>
              <br />
              <code>james.cole@sitegate.demo</code> site manager
              <br />
              <code>emma.hart@sitegate.demo</code> admin
            </div>
          ) : (
            <div className="sg-demo">
              Live API · <span className="sg-mono">{API_BASE}</span>
              <br />
              Use an account from your AccessControl database.
            </div>
          )}
          <Field label="Email" error={error}>
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Button variant="primary" block disabled={busy} type="submit">
            {busy ? "Signing in…" : "Enter console"}
          </Button>
          <p className="sg-muted">
            <Link to="/forgot">Forgot password</Link>
            {" · "}
            <Link to="/worker">Worker flow</Link>
          </p>
          {USE_MOCK ? (
            <button
              type="button"
              className="sg-btn sg-btn-ghost sg-btn-sm"
              onClick={() => {
                resetDemoData();
                clearSession();
                setError("");
              }}
            >
              Reset demo data
            </button>
          ) : null}
        </form>
      </div>
    </div>
  );
}
