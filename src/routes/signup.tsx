import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { BrandMark, Button, Field, Input, Select } from "@/components/ui";
import { api, normalizeLogin } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { writeSession } from "@/lib/session";

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    password: "",
    role: "SiteManager",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.signup({ ...form, isActive: true });
      const result = await api.login({ email: form.email, password: form.password });
      writeSession(normalizeLogin(result));
      await navigate({ to: "/app" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sg-auth">
      <div className="sg-auth-art">
        <BrandMark light />
        <h1>Stand up a site in a few fields.</h1>
        <p className="sg-muted" style={{ color: "#b7c4c1" }}>
          After this you can add rooms and print QR posters.
        </p>
      </div>
      <div className="sg-auth-form">
        <form className="sg-auth-card" onSubmit={onSubmit}>
          <h1 style={{ fontSize: "1.6rem" }}>Create manager account</h1>
          {error ? <p className="sg-error">{error}</p> : null}
          <div className="sg-form-grid two">
            <Field label="First name">
              <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required />
            </Field>
            <Field label="Last name">
              <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required />
            </Field>
          </div>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
          </Field>
          <Field label="Phone">
            <Input value={form.phoneNumber} onChange={(e) => set("phoneNumber", e.target.value)} />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              minLength={8}
              required
            />
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => set("role", e.target.value)}>
              <option value="SiteManager">Site manager</option>
              <option value="Manager">Work area manager</option>
              <option value="Admin">Admin</option>
            </Select>
          </Field>
          <Button variant="primary" block disabled={busy} type="submit">
            {busy ? "Creating…" : "Create account"}
          </Button>
          <p className="sg-muted">
            Already registered? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
