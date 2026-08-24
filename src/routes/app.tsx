import { createFileRoute } from "@tanstack/react-router";
import { ManagerShell } from "@/components/ManagerShell";

export const Route = createFileRoute("/app")({
  component: ManagerShell,
});
