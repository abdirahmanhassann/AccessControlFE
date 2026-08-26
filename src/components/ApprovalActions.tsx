import { useState } from "react";
import { Button, toast } from "@/components/ui";
import { api } from "@/lib/api/client";
import { readSession } from "@/lib/session";
import { ApiError } from "@/lib/api/types";

const ACTIONS = [
  { status: "Approved", label: "Approve", variant: "ok" as const },
  { status: "Rejected", label: "Reject", variant: "danger" as const },
  { status: "Cancelled", label: "Cancel", variant: "ghost" as const },
];

export function ApprovalActions({
  approvalId,
  onDone,
}: {
  approvalId: number;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(status: string) {
    const session = readSession();
    if (!session) {
      toast("Sign in as staff first.");
      return;
    }
    if (!approvalId) {
      toast("This row has no approval id.");
      return;
    }
    setBusy(status);
    try {
      await api.updateApproval(session.token, {
        id: approvalId,
        status,
        comment: "",
        reviewedAt: new Date().toISOString(),
      });
      toast(status === "Approved" ? "Approved" : status === "Rejected" ? "Rejected" : "Cancelled");
      await onDone?.();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not update approval");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="sg-actions" onClick={(e) => e.stopPropagation()}>
      {ACTIONS.map((a) => (
        <Button
          key={a.status}
          size="sm"
          variant={a.variant}
          disabled={!!busy}
          onClick={() => void decide(a.status)}
        >
          {busy === a.status ? "Saving…" : a.label}
        </Button>
      ))}
    </div>
  );
}
