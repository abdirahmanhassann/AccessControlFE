import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/ui";

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
  return (
    <div className="sg-auth">
      <div className="sg-auth-art">
        <BrandMark light />
        <h1>Manager accounts are created by staff.</h1>
        <p className="sg-muted" style={{ color: "#b7c4c1" }}>
          Ask a site manager to add you under Staff in the console.
        </p>
      </div>
      <div className="sg-auth-form">
        <div className="sg-auth-card">
          <h1 style={{ fontSize: "1.6rem" }}>Account closed</h1>
          <p className="sg-muted">
            You cannot create a manager account from this page. A signed-in manager adds staff from
            the console.
          </p>
          <p className="sg-muted" style={{ marginTop: 16 }}>
            <Link to="/login">Sign in</Link>
            {" · "}
            <Link to="/">Home</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
