import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { BrandMark, Button, Field, Input } from "@/components/ui";
import { USE_MOCK, api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";

export const Route = createFileRoute("/forgot")({ component: ForgotPage });

function ForgotPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.requestPasswordReset(email);
      setPreview(result.code ?? "");
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send a reset code.");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.resetPassword({ email, code, password });
      await navigate({ to: "/login" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sg-auth">
      <div className="sg-auth-art">
        <BrandMark light />
        <h1>Reset a manager password.</h1>
        <p className="sg-muted" style={{ color: "#b7c4c1" }}>
          We text a one-time code to the phone on the account.
        </p>
      </div>
      <div className="sg-auth-form">
        <form className="sg-auth-card" onSubmit={sent ? resetPassword : requestCode}>
          <h1 style={{ fontSize: "1.6rem" }}>Forgot password</h1>
          {error ? <p className="sg-error">{error}</p> : null}
          <Field label="Email">
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={sent}
            />
          </Field>
          {sent ? (
            <>
              {USE_MOCK && preview ? (
                <div className="sg-demo">
                  Demo SMS code <span className="sg-otp">{preview}</span>
                </div>
              ) : (
                <p className="sg-muted">If that account exists, a code was sent to the phone on file.</p>
              )}
              <Field label="SMS code">
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </Field>
              <Field label="New password">
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </Field>
              <Button variant="primary" block disabled={busy} type="submit">
                {busy ? "Saving…" : "Set new password"}
              </Button>
            </>
          ) : (
            <Button variant="primary" block disabled={busy} type="submit">
              {busy ? "Sending…" : "Send reset code"}
            </Button>
          )}
          <p className="sg-muted">
            <Link to="/login">Back to sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
