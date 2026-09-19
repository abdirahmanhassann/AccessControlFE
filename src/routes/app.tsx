import { createFileRoute, redirect } from "@tanstack/react-router";
import { ManagerShell } from "@/components/ManagerShell";
import { readSession } from "@/lib/session";

export const Route = createFileRoute("/app")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const session = readSession();
    if (!session || session.kind !== "staff" || !session.token) {
      throw redirect({ to: "/login" });
    }
  },
  component: ManagerShell,
});
