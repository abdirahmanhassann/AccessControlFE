/**
 * What counts as an overdue visit.
 *
 * The rule has two halves and they are easy to conflate: a worker still on
 * site past their time, and a booking nobody turned up for. Both are past
 * their time frame, neither can be closed by the worker, and both have to
 * reach the manager's Overdue tab. The tab used to show only the first.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isOverdueClockOut,
  isOverdueVisit,
  overdueVisits,
} from "./overdue.ts";
import type { AccessRequest, AccessRequestApproval } from "./api/types.ts";

const HOUR = 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

function request(over: Partial<AccessRequest> = {}): AccessRequest {
  return {
    id: 1,
    workerId: 10,
    roomId: 100,
    status: "Approved",
    reason: "First fix",
    workType: "Electrical",
    description: "",
    workFrom: at(-4 * HOUR),
    workTo: at(-1 * HOUR),
    approvedAt: at(-5 * HOUR),
    rejectedAt: null,
    clockedInAt: null,
    expectedClockOutAt: null,
    clockedOutAt: null,
    completedAt: null,
    createdAt: at(-6 * HOUR),
    ...over,
  };
}

const noApprovals: AccessRequestApproval[] = [];

test("a worker still on site past their time frame is overdue", () => {
  const req = request({ clockedInAt: at(-3 * HOUR) });
  assert.equal(isOverdueVisit(req, noApprovals), true);
  assert.equal(isOverdueClockOut(req, noApprovals), true);
});

test("a visit nobody turned up for is overdue too", () => {
  const req = request({ clockedInAt: null });
  assert.equal(isOverdueVisit(req, noApprovals), true, "the manager still has to close it");
  assert.equal(
    isOverdueClockOut(req, noApprovals),
    false,
    "but nobody is on site, so it is not a late clock-out",
  );
});

test("a closed visit is never overdue", () => {
  for (const over of [{ clockedOutAt: at(-30 * 60 * 1000) }, { completedAt: at(-30 * 60 * 1000) }]) {
    assert.equal(isOverdueVisit(request({ clockedInAt: at(-3 * HOUR), ...over }), noApprovals), false);
  }
});

test("a visit still inside its time frame is not overdue", () => {
  const req = request({ workTo: at(2 * HOUR), clockedInAt: at(-1 * HOUR) });
  assert.equal(isOverdueVisit(req, noApprovals), false);
});

test("only approved visits count", () => {
  for (const status of ["Pending", "Rejected", "Cancelled"]) {
    assert.equal(isOverdueVisit(request({ status }), noApprovals), false, status);
  }
});

test("the latest decision wins over the request's own status", () => {
  const req = request({ status: "Approved" });
  const rejected: AccessRequestApproval[] = [
    {
      id: 1,
      accessRequestId: req.id,
      approverUserId: 2,
      status: "Rejected",
      comment: "",
      reviewedAt: at(-2 * HOUR),
      createdAt: at(-5 * HOUR),
    } as AccessRequestApproval,
  ];
  assert.equal(isOverdueVisit(req, rejected), false);
});

test("expectedClockOutAt stands in when the request has no workTo", () => {
  const req = request({ workTo: null, expectedClockOutAt: at(-1 * HOUR), clockedInAt: at(-3 * HOUR) });
  assert.equal(isOverdueVisit(req, noApprovals), true);

  const undated = request({ workTo: null, expectedClockOutAt: null });
  assert.equal(isOverdueVisit(undated, noApprovals), false, "nothing to be late against");
});

test("overdueVisits returns both kinds, longest overdue first", () => {
  const onSite = request({ id: 1, workTo: at(-1 * HOUR), clockedInAt: at(-3 * HOUR) });
  const noShow = request({ id: 2, workTo: at(-5 * HOUR), clockedInAt: null });
  const fine = request({ id: 3, workTo: at(3 * HOUR) });
  const closed = request({ id: 4, workTo: at(-9 * HOUR), completedAt: at(-8 * HOUR) });

  const rows = overdueVisits({ requests: [onSite, noShow, fine, closed], approvals: noApprovals });
  assert.deepEqual(
    rows.map((r) => r.id),
    [2, 1],
  );
});
