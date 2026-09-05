import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, Button, Input, PageSkeleton, Select } from "@/components/ui";
import { ApprovalActions } from "@/components/ApprovalActions";
import { readSession } from "@/lib/session";
import { latestApproval, roomLabel, useStaffData, workerLabel, effectiveStatus } from "@/lib/staff-data";
import { statusTone, when } from "@/lib/format";
import { useMounted } from "@/lib/use-mounted";
import { api } from "@/lib/api/client";
import type { AccessRequest } from "@/lib/api/types";

export const Route = createFileRoute("/app/requests")({ component: RequestsPage });

const PAGE_SIZE = 25;

function RequestsPage() {
  const navigate = useNavigate();
  const mounted = useMounted();
  const [token, setToken] = useState<string>();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<AccessRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [listError, setListError] = useState("");
  useEffect(() => setToken(readSession()?.token), []);
  const { data, error, loading, reload } = useStaffData(token, { pollRequests: true });

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(q.trim());
      setPage(0);
    }, 300);
    return () => window.clearTimeout(id);
  }, [q]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void api
      .getAccessRequests(token, {
        status: status === "all" ? undefined : status,
        search: search || undefined,
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE,
      })
      .then((list) => {
        if (cancelled) return;
        setRows(list);
        setTotal(list.total);
        setListError("");
      })
      .catch((err) => {
        if (!cancelled) setListError(err instanceof Error ? err.message : "Could not load requests");
      });
    return () => {
      cancelled = true;
    };
  }, [token, status, search, page, data?.requests]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!mounted || loading || !data) return <PageSkeleton />;

  return (
    <div className="sg-content">
      {error || listError ? <p className="sg-error">{error || listError}</p> : null}
      <div className="sg-toolbar">
        <Input placeholder="Search worker, location, trade" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="all">All statuses</option>
          <option>Pending</option>
          <option>Approved</option>
          <option>Rejected</option>
          <option>Cancelled</option>
          <option>Completed</option>
        </Select>
      </div>
      <div className="sg-table-wrap">
        <table className="sg-table">
          <thead>
            <tr>
              <th>Worker</th>
              <th>Room</th>
              <th>Trade</th>
              <th>Status</th>
              <th>Opened</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = effectiveStatus(r, data.approvals);
              const approval = latestApproval(data, r.id);
              return (
                <tr
                  key={r.id}
                  tabIndex={0}
                  onClick={() => navigate({ to: "/app/requests/$id", params: { id: String(r.id) } })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void navigate({ to: "/app/requests/$id", params: { id: String(r.id) } });
                    }
                  }}
                >
                  <td>
                    <Link
                      to="/app/requests/$id"
                      params={{ id: String(r.id) }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {workerLabel(data, r.workerId, approval || r)}
                    </Link>
                  </td>
                  <td>{roomLabel(data, r.roomId)}</td>
                  <td>{r.workType}</td>
                  <td>
                    <Badge tone={statusTone(st)}>{st}</Badge>
                  </td>
                  <td className="sg-mono">{when(r.createdAt)}</td>
                  <td>
                    {approval?.id || approval?.accessRequestId ? (
                      <ApprovalActions
                        approval={approval}
                        accessRequestId={r.id}
                        request={r}
                        onDone={reload}
                      />
                    ) : (
                      <span className="sg-help">No approval row</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="sg-empty">No matching requests.</p> : null}
      </div>
      <div className="sg-pager">
        <Button disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          Previous
        </Button>
        <span className="sg-muted">
          Page {page + 1} of {pageCount} · {total} requests
        </span>
        <Button disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
