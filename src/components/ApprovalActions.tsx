import { useState } from "react";
import { Button, toast } from "@/components/ui";
import { api } from "@/lib/api/client";
import { readSession } from "@/lib/session";
import { ApiError, type AccessRequestApproval } from "@/lib/api/types";

const ACTIONS = [
  { status: "Approved", label: "Approve", variant: "ok" as const },
  { status: "Rejected", label: "Reject", variant: "danger" as const },
  { status: "Cancelled", label: "Cancel", variant: "ghost" as const },
];

export function ApprovalActions({
  approval,
  accessRequestId,
  onDone,
}: {
  approval: Pick<AccessRequestApproval, "id" | "accessRequestId" | "approverUserId">;
  accessRequestId?: number;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(status: string) {
    const session = readSession();
    if (!session) {
      toast("Sign in as staff first.");
      return;
    }
    const accessRequestApprovalId = Number(approval.id);
    const requestId = Number(accessRequestId || approval.accessRequestId);
    if (!accessRequestApprovalId) {
      toast("Missing AccessRequestApprovalId.");
      return;
    }
    if (!requestId) {
      toast("Missing AccessRequestId.");
      return;
    }
    setBusy(status);
    try {
      await api.updateApproval(session.token, {
        id: accessRequestApprovalId,
        accessRequestId: requestId,
        approverUserId: Number(approval.approverUserId) || session.user.id || undefined,
        status,
        comment: "",
        reviewedAt: new Date().toISOString().slice(0, 19),
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
