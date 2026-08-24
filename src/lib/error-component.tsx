import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="sg-worker-main" style={{ minHeight: "100dvh", placeContent: "center" }}>
      <span className="sg-badge sg-badge-danger" aria-hidden="true">
        <TriangleAlert size={14} />
      </span>
      <h1>Something went wrong</h1>
      <p className="sg-muted">
        {error.message || "An unexpected error occurred. Try reloading the page."}
      </p>
    </main>
  );
}
