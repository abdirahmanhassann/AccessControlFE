import { createFileRoute, Link } from "@tanstack/react-router";
// FILE CORRUPTED DURING INTERVAL CHANGE - see instructions
export const Route = createFileRoute("/worker")({
  component: () => (
    <div className="sg-worker">
      <p className="sg-error">
        worker.tsx needs restore. Run:{\" \"}
        <code>git checkout 35ac5f0b -- src/routes/worker.tsx</code>
        {\" \"}then change setInterval 2500 to 10_000.
      </p>
    </div>
  ),
});
