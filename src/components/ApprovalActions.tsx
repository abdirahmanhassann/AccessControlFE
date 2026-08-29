import { useState } from "react";
import { Button, toast } from "@/components/ui";
import { api } from "@/lib/api/client";
import { readSession } from "@/lib/session";
import { ApiError, type AccessRequest, type AccessRequestApproval } from "@/lib/api/types";

const ACTIONS = [
  { status: "Approved", label: "Approve", variant: "ok" as const },
  { status: "Rejected", label: "Reject", variant: "danger" as const },
  { status: "Cancelled", label: "Cancel", variant: "ghost" as const },
];

export function ApprovalActions({
  approval,
  accessRequestId,
  request,
  onDone,
}: {
  approval: Pick<AccessRequestApproval, "id" | "accessRequestId" | "approverUserId">;
  accessRequestId?: number;
  request?: Pick<AccessRequest, "id" | "workerId" | "roomId" | "reason" | "workType" | "description">;
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
    const requestId = Number(accessRequestId || approval.accessRequestId || request?.id);
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
        workerId: request?.workerId,
        roomId: request?.roomId,
        reason: request?.reason,
        workType: request?.workType,
        description: request?.description,
        status,
        comment: "",
        reviewedAt: new Date().toISOString().slice(0, 19),
      });
      try {
        await api.insertAudit(session.token, {
          accessRequestId: requestId,
          userId: session.user.id,
          eventType: status,
          description: `${session.user.firstName} ${session.user.lastName} marked request #${requestId} as ${status}.`,
        });
      } catch {
        /* audit is best-effort */
      }
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
