import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  Clock3,
  Hourglass,
  LogOut,
  QrCode,
  ShieldAlert,
  X,
} from "lucide-react";
import { BrandMark, Button, Field, Input, Select, Textarea, toast } from "@/components/ui";
import { QrImage } from "@/components/QrImage";
import { api, USE_MOCK } from "@/lib/api/client";
import { ApiError, PHOTO_TYPES, WORK_TYPES, type AccessRequest, type Department, type Room, type ScanQrResult, type User, type WorkArea } from "@/lib/api/types";
import { compressImage } from "@/lib/image";
import { writeWorkerSession, readWorkerSession, readSession, clearWorkerSession } from "@/lib/session";
import { useWorkerFlow } from "@/lib/worker-flow";
import { prettyPhone, whenExact } from "@/lib/format";
import { locationDisplay, matchEnteredRoom } from "@/lib/location";
import { useMounted } from "@/lib/use-mounted";

const DEMO_SITES = [
  { qr: "SG-RIV-GATE", name: "Riverside", note: "Tower 1 + Tower 2. Demo clock-out: 07700 900123" },
  { qr: "SG-OAK-GATE", name: "Oakridge Mixed-Use", note: "Tower A" },
];

const STEPS = ["scan", "phone", "otp", "form", "waiting", "visit", "clockout", "done"] as const;

function isOpenVisit(req: AccessRequest | null | undefined, siteRoomIds?: number[]) {
  if (!req) return false;
  if (req.clockedOutAt || req.completedAt) return false;
  if (/^completed$/i.test(String(req.status))) return false;
  if (!/^approved$/i.test(String(req.status))) return false;
  if (siteRoomIds?.length && req.roomId && !siteRoomIds.includes(req.roomId)) return false;
  return true;
}

function digits(value: string | undefined) {
  return (value || "").replace(/\D/g, "");
}

async function loadWorkerRequests(opts: {
  token?: string;
  workerId?: number;
  roomId?: number;
  siteId?: number;
  phone?: string;
}) {
  const filters: Array<{ workerId?: number; roomId?: number; siteId?: number; take: number }> = [];
  if (opts.workerId) filters.push({ workerId: opts.workerId, siteId: opts.siteId || undefined, take: 50 });
  if (opts.workerId) filters.push({ workerId: opts.workerId, take: 50 });
  if (opts.siteId) filters.push({ siteId: opts.siteId, take: 50 });
  if (opts.roomId) filters.push({ roomId: opts.roomId, take: 50 });
  const phone = digits(opts.phone);
  const seen = new Set<number>();
  const rows: AccessRequest[] = [];
  for (const filter of filters) {
    try {
      const page = await api.getAccessRequests(opts.token, filter);
      for (const row of page) {
        if (!row.id || seen.has(row.id)) continue;
        seen.add(row.id);
        rows.push(row);
      }
    } catch {
      /* try the next filter */
    }
  }
  if (phone) {
    const matched = rows.filter((r) => digits(r.phoneNumber || r.workerPhoneNumber) === phone);
    if (matched.length) return matched;
  }
  return rows;
}

async function locationForRequest(
  roomId: number | undefined,
  site: { siteId?: number; siteName?: string; siteAddress?: string },
): Promise<ScanQrResult | null> {
  if (!roomId || !site.siteId) return null;
  const rooms = await api.listLocations({ siteId: site.siteId }).catch(() => []);
  const room = rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const towers = await api.listTowers(site.siteId).catch(() => []);
  const tower = towers.find((t) => t.id === room.workAreaId);
  return {
    ...room,
    workAreaName: tower?.name ?? "",
    siteName: site.siteName ?? "",
    siteId: site.siteId,
    siteAddress: site.siteAddress ?? "",
    scanKind: "room",
  };
}

export const Route = createFileRoute("/worker")({
  validateSearch: (s: Record<string, unknown>): { qr?: string } =>
    typeof s.qr === "string" && s.qr ? { qr: s.qr } : {},
  component: WorkerPage,
});

function WorkerPage() {
  const mounted = useMounted();
  const search = Route.useSearch();
  const flow = useWorkerFlow();
  const stepIndex = Math.max(0, STEPS.indexOf(flow.step));

  useEffect(() => {
    if (search.qr && search.qr !== flow.qrCodeIdentifier) {
      flow.startWithQr(search.qr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.qr]);

  if (!mounted) {
    return (
      <div className="sg-worker">
        <div className="sg-worker-bar">
          <BrandMark />
        </div>
        <div className="sg-worker-main">
          <div className="sg-skel" style={{ height: 8 }} />
          <div className="sg-skel" style={{ height: 220 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="sg-worker">
      <header className="sg-worker-bar">
        <BrandMark />
        <div className="sg-actions">
          <button className="sg-btn sg-btn-ghost sg-btn-sm" onClick={() => flow.reset()}>
            Start over
          </button>
          <button
            className="sg-btn sg-btn-ghost sg-btn-sm"
            onClick={() => {
              clearWorkerSession();
              flow.reset();
            }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>
      <main className="sg-worker-main">
        <div className="sg-progress" aria-hidden="true">
          {STEPS.slice(0, 6).map((_, i) => (
            <i key={i} className={i <= Math.min(stepIndex, 5) ? "is-on" : ""} />
          ))}
        </div>
        {flow.step === "scan" && <ScanStep />}
        {flow.step === "phone" && <PhoneStep />}
        {flow.step === "otp" && <OtpStep />}
        {flow.step === "form" && <FormStep />}
        {flow.step === "waiting" && <WaitingStep />}
        {flow.step === "visit" && <VisitStep />}
        {flow.step === "clockout" && <ClockOutStep />}
        {flow.step === "done" && <DoneStep />}
      </main>
    </div>
  );
}

function ScanStep() {
  const flow = useWorkerFlow();
  const [manual, setManual] = useState(flow.qrCodeIdentifier);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [camError, setCamError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camOn, setCamOn] = useState(false);
  const [liveSites, setLiveSites] = useState<Array<{ qr: string; name: string; note?: string }>>([]);

  useEffect(() => {
    if (USE_MOCK) return;
    const token = readSession()?.token;
    if (!token) return;
    void api
      .getSites(token)
      .then((rows) =>
        setLiveSites(
          rows
            .filter((s) => s.isActive !== false && s.qrCodeIdentifier)
            .map((s) => ({ qr: s.qrCodeIdentifier || "", name: s.name, note: s.address })),
        ),
      )
      .catch(() => setLiveSites([]));
  }, []);

  async function go(qr: string) {
    setBusy(true);
    setError("");
    try {
      const code = qr.trim();
      const scanned = await api.scanQr(code);
      const isSite = scanned.scanKind === "site" || (scanned.siteId && !scanned.id);
      flow.set({
        qrCodeIdentifier: code,
        room: isSite ? null : scanned,
        siteId: scanned.siteId,
        siteName: scanned.siteName,
        siteAddress: scanned.siteAddress,
        step: "phone",
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "QR not recognised.");
    } finally {
      setBusy(false);
    }
  }

  async function startCamera() {
    setCamError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamOn(true);
      const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: ImageBitmapSource) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
      if (!Detector) {
        setCamError("This browser cannot read QR from camera. Pick a demo site or type the code.");
        return;
      }
      const detector = new Detector({ formats: ["qr_code"] });
      const tick = async () => {
        if (!videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes[0]?.rawValue) {
            stream.getTracks().forEach((t) => t.stop());
            setCamOn(false);
            await go(codes[0].rawValue);
            return;
          }
        } catch {
          /* keep scanning */
        }
        requestAnimationFrame(() => void tick());
      };
      void tick();
    } catch {
      setCamError("Camera is blocked in this preview. Use a demo site below.");
    }
  }

  return (
    <>
      <h1>Scan the site QR</h1>
      <p className="sg-muted">Point at the code at the gate. You pick the tower, department, and room on the next form.</p>
      {error ? <p className="sg-error">{error}</p> : null}
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ display: camOn ? "block" : "none", width: "100%", borderRadius: 16, background: "#111" }}
      />
      {camError ? <p className="sg-help">{camError}</p> : null}
      <Button onClick={() => void startCamera()} disabled={camOn}>
        <Camera size={16} /> Use camera
      </Button>
      <Field label="Or enter the code">
        <Input
          value={manual}
          onChange={(e) => setManual(e.target.value.toUpperCase())}
          placeholder="SG-RIV-GATE"
        />
      </Field>
      <Button variant="primary" block disabled={busy || !manual.trim()} onClick={() => void go(manual)}>
        {busy ? "Looking up…" : "Continue"}
      </Button>
      <p className="sg-label" style={{ marginTop: 8 }}>
        {USE_MOCK ? "Demo sites" : "Sites from AccessControl"}
      </p>
      <div className="sg-room-grid">
        {(USE_MOCK ? DEMO_SITES : liveSites).map((r) => (
          <button key={r.qr} className="sg-room-pick" onClick={() => void go(r.qr)} disabled={busy}>
            <QrImage value={r.qr} size={64} />
            <div>
              <strong>{r.name}</strong>
              <div className="sg-muted">{r.qr}</div>
              {r.note ? <div className="sg-help">{r.note}</div> : null}
            </div>
            <QrCode size={16} />
          </button>
        ))}
      </div>
      {!USE_MOCK && !liveSites.length ? (
        <p className="sg-help">
          Sign in as a manager, add a gate QR on the site, then scan that code here.
        </p>
      ) : null}
    </>
  );
}

function PhoneStep() {
  const flow = useWorkerFlow();
  const [phone, setPhone] = useState(flow.phoneNumber || "07700");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const expires = new Date(Date.now() + 10 * 60_000).toISOString();
      const otp = await api.insertOtp(phone, expires);
      flow.set({
        phoneNumber: phone.replace(/\D/g, ""),
        otpCode: otp?.code ?? "",
        otpExpiresAt: otp?.expiresAt ?? expires,
        step: "otp",
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send} className="sg-form-grid">
      <h1>Your mobile number</h1>
      <p className="sg-muted">We send a one-time code to this number.</p>
      {flow.siteName ? (
        <div className="sg-room-chip">
          <strong>{flow.siteName}</strong>
          <small>{flow.siteAddress}</small>
        </div>
      ) : null}
      <Field label="Phone" error={error}>
        <Input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
      </Field>
      <Button variant="primary" block disabled={busy} type="submit">
        {busy ? "Sending…" : "Send SMS code"}
      </Button>
      <Button type="button" onClick={() => flow.set({ step: "scan" })}>
        Back
      </Button>
    </form>
  );
}

function OtpStep() {
  const flow = useWorkerFlow();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.verifyOtp(Number(code));
      const worker = result.worker?.id
        ? result.worker
        : {
            id: 0,
            firstName: "",
            lastName: "",
            phoneNumber: result.phoneNumber || flow.phoneNumber,
            companyName: "",
            isActive: true,
            createdAt: new Date().toISOString(),
          };
      writeWorkerSession({
        token: result.token,
        user: {
          id: worker.id,
          firstName: worker.firstName || "Worker",
          lastName: worker.lastName,
          email: "",
          phoneNumber: result.phoneNumber || flow.phoneNumber,
          role: "Worker",
          isActive: true,
          createdAt: worker.createdAt,
        },
        workerId: worker.id,
        phoneNumber: result.phoneNumber || flow.phoneNumber,
        kind: "worker",
      });
      const session = readWorkerSession();
      const token = session?.token || result.token || "";
      const siteId = flow.siteId || flow.room?.siteId || 0;
      const siteRooms = siteId ? await api.listLocations({ siteId }).catch(() => []) : [];
      const siteRoomIds = siteRooms.map((r) => r.id);
      const requests = await loadWorkerRequests({
        token,
        workerId: worker.id || undefined,
        siteId: siteId || undefined,
        phone: result.phoneNumber || flow.phoneNumber,
      });
      const activePending = requests.find((r) => /^pending$/i.test(String(r.status)));
      const openVisit = requests.find((r) => isOpenVisit(r, siteRoomIds));
      const attached = await locationForRequest(activePending?.roomId || openVisit?.roomId, {
        siteId,
        siteName: flow.siteName || flow.room?.siteName || "",
        siteAddress: flow.siteAddress || flow.room?.siteAddress || "",
      });
      flow.set({
        siteId: siteId || flow.siteId,
        siteName: flow.siteName || flow.room?.siteName || "",
        siteAddress: flow.siteAddress || flow.room?.siteAddress || "",
        room: attached || flow.room,
      });
      if (activePending) {
        flow.set({ worker, request: activePending, mode: "waiting", step: "waiting" });
      } else if (openVisit) {
        flow.set({ worker, request: openVisit, mode: "visit", step: "visit" });
      } else {
        flow.set({ worker, request: null, mode: "request", step: "form" });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Code not accepted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={verify} className="sg-form-grid">
      <h1>Enter the SMS code</h1>
      {flow.otpCode ? (
        <div className="sg-sms">
          <div className="from">Demo SMS · SiteGate</div>
          <p>Your verification code is</p>
          <div className="sg-otp">{flow.otpCode}</div>
          <p className="sg-help">On a live site this arrives as a text. It is shown here so you can try the flow.</p>
        </div>
      ) : (
        <p className="sg-muted">Check your messages for a 6-digit code.</p>
      )}
      <Field label="Code" error={error}>
        <Input
          className="sg-otp-input"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          required
        />
      </Field>
      <Button variant="primary" block disabled={busy || code.length !== 6} type="submit">
        {busy ? "Checking…" : "Verify"}
      </Button>
      <Button type="button" onClick={() => flow.set({ step: "phone" })}>
        Back
      </Button>
    </form>
  );
}

function todayIsoDate() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function toDateTime(date: string, time: string) {
  if (!date || !time) return "";
  return `${date}T${time}:00`;
}

function FormStep() {
  const flow = useWorkerFlow();
  const [form, setForm] = useState({
    firstName: flow.worker?.firstName ?? "",
    lastName: flow.worker?.lastName ?? "",
    companyName: flow.worker?.companyName ?? "",
    supervisorName: "",
    workType: "",
    workDate: todayIsoDate(),
    workFrom: "08:00",
    workTo: "17:00",
    towerId: flow.room?.workAreaId ? String(flow.room.workAreaId) : "",
    departmentId: "",
    roomText: flow.room?.roomNumber || flow.room?.name || "",
    locationId: flow.room?.id ? String(flow.room.id) : "",
    reason: "First fix",
    description: "",
    approverUserId: "",
  });
  const [towers, setTowers] = useState<WorkArea[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [locations, setLocations] = useState<Room[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openVisit, setOpenVisit] = useState<AccessRequest | null>(null);
  const siteId = flow.siteId || flow.room?.siteId || 0;
  const matchedRoom = matchEnteredRoom(locations, form.roomText);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    void Promise.all([api.listTowers(siteId), api.listDepartments(siteId)])
      .then(([towerRows, deptRows]) => {
        if (cancelled) return;
        setTowers(towerRows);
        setDepartments(deptRows);
        setForm((prev) => {
          const towerOk = prev.towerId && towerRows.some((t) => String(t.id) === prev.towerId);
          const deptOk = prev.departmentId && deptRows.some((d) => String(d.id) === prev.departmentId);
          if (towerOk && deptOk) return prev;
          return {
            ...prev,
            towerId: towerOk ? prev.towerId : "",
            departmentId: deptOk ? prev.departmentId : "",
            locationId: towerOk ? prev.locationId : "",
            roomText: towerOk ? prev.roomText : "",
            approverUserId: towerOk && deptOk ? prev.approverUserId : "",
          };
        });
      })
      .catch(() => {
        if (cancelled) return;
        setTowers([]);
        setDepartments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  useEffect(() => {
    const towerId = Number(form.towerId);
    if (!towerId) {
      setLocations([]);
      return;
    }
    let cancelled = false;
    void api.listLocations({ workAreaId: towerId }).then((rows) => {
      if (cancelled) return;
      setLocations(rows);
      setForm((prev) => {
        const stillThere = prev.locationId && rows.some((r) => String(r.id) === prev.locationId);
        if (stillThere) return prev;
        return { ...prev, locationId: "", roomText: prev.towerId === String(towerId) ? prev.roomText : "", approverUserId: "" };
      });
    }).catch(() => {
      if (!cancelled) setLocations([]);
    });
    return () => {
      cancelled = true;
    };
  }, [form.towerId]);

  useEffect(() => {
    const nextId = matchedRoom ? String(matchedRoom.id) : "";
    setForm((prev) => (prev.locationId === nextId ? prev : { ...prev, locationId: nextId, approverUserId: "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedRoom?.id, form.roomText]);

  useEffect(() => {
    const locationId = Number(form.locationId);
    const departmentId = Number(form.departmentId);
    if (!locationId || !departmentId) {
      setManagers([]);
      return;
    }
    let cancelled = false;
    void api.listManagers(locationId, departmentId).then((rows) => {
      if (cancelled) return;
      setManagers(rows);
      setForm((prev) => ({
        ...prev,
        approverUserId: rows.some((m) => String(m.id) === prev.approverUserId)
          ? prev.approverUserId
          : rows[0]
            ? String(rows[0].id)
            : "",
      }));
    }).catch(() => {
      if (!cancelled) setManagers([]);
    });
    return () => {
      cancelled = true;
    };
  }, [form.locationId, form.departmentId]);

  useEffect(() => {
    const workerId = flow.worker?.id;
    if (!siteId && !workerId) return;
    let cancelled = false;
    void (async () => {
      const siteRooms = siteId ? await api.listLocations({ siteId }).catch(() => []) : [];
      const rows = await loadWorkerRequests({
        token: readWorkerSession()?.token,
        workerId,
        siteId: siteId || undefined,
        phone: flow.phoneNumber,
      });
      if (cancelled) return;
      const hit = rows.find((r) => isOpenVisit(r, siteRooms.map((x) => x.id)));
      setOpenVisit(hit ?? null);
    })().catch(() => {
      if (!cancelled) setOpenVisit(null);
    });
    return () => {
      cancelled = true;
    };
  }, [siteId, flow.worker?.id]);

  useEffect(() => {
    if (flow.siteId || flow.room?.id) return;
    const qr = flow.qrCodeIdentifier.trim();
    if (!qr) {
      flow.set({ step: "scan" });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const scanned = await api.scanQr(qr);
        if (cancelled) return;
        const isSite = scanned.scanKind === "site" || (scanned.siteId && !scanned.id);
        flow.set({
          room: isSite ? null : scanned,
          siteId: scanned.siteId,
          siteName: scanned.siteName,
          siteAddress: scanned.siteAddress,
          qrCodeIdentifier: qr,
        });
      } catch {
        if (!cancelled) flow.set({ step: "scan" });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedLocation = matchedRoom || locations.find((r) => String(r.id) === form.locationId);
  const selectedTower = towers.find((t) => String(t.id) === form.towerId);
  const selectedDepartment = departments.find((d) => String(d.id) === form.departmentId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.towerId) {
      setError("Choose the tower.");
      return;
    }
    if (!form.departmentId) {
      setError("Choose the department.");
      return;
    }
    const roomId = selectedLocation?.id || Number(form.locationId);
    const approverUserId = Number(form.approverUserId);
    if (!roomId) {
      setError("Enter a room that exists in this tower — apartment number or riser, for example 13.2.");
      return;
    }
    if (!approverUserId) {
      setError("Choose the manager who should approve this request.");
      return;
    }
    if (!managers.some((m) => m.id === approverUserId)) {
      setError("Choose a manager responsible for that department.");
      return;
    }
    if (!form.workType) {
      setError("Choose the type of job.");
      return;
    }
    if (form.workFrom && form.workTo && form.workTo <= form.workFrom) {
      setError("The 'to' time must be after the start time.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const worker = await api.insertWorker({
        firstName: form.firstName,
        lastName: form.lastName,
        phoneNumber: flow.phoneNumber,
        companyName: form.companyName,
      });
      const existing = readWorkerSession();
      if (existing) {
        writeWorkerSession({
          ...existing,
          workerId: worker.id,
          user: {
            ...existing.user,
            id: worker.id,
            firstName: worker.firstName,
            lastName: worker.lastName,
            phoneNumber: worker.phoneNumber,
          },
        });
      }
      const workFrom = toDateTime(form.workDate, form.workFrom);
      const workTo = toDateTime(form.workDate, form.workTo);
      const request = await api.insertAccessRequest({
        phoneNumber: flow.phoneNumber,
        workerId: worker.id,
        roomId,
        reason: form.reason,
        workType: form.workType,
        description: form.description,
        supervisorName: form.supervisorName,
        workFrom,
        workTo,
        qrCodeIdentifier: flow.qrCodeIdentifier,
        approverUserId,
      });
      const picked = selectedLocation
        ? {
            ...selectedLocation,
            workAreaName: selectedTower?.name ?? "",
            siteName: flow.siteName,
            siteId,
            siteAddress: flow.siteAddress,
            scanKind: "room" as const,
          }
        : flow.room;
      const token = readWorkerSession()?.token;
      if (token && request.id) {
        try {
          await api.insertApproval(token, {
            accessRequestId: request.id,
            approverUserId,
            status: "Pending",
            comment: "",
          });
        } catch {
          /* backend may already insert the pending approval */
        }
        try {
          const manager = managers.find((m) => m.id === approverUserId);
          await api.insertAudit(token, {
            accessRequestId: request.id,
            workerId: worker.id,
            eventType: "AccessRequested",
            description: `${worker.firstName} ${worker.lastName} submitted access for ${locationDisplay(selectedLocation)} to ${manager ? `${manager.firstName} ${manager.lastName}` : `manager #${approverUserId}`}.`,
            metadata: JSON.stringify({
              approverUserId,
              roomId,
              towerId: Number(form.towerId),
              departmentId: Number(form.departmentId),
            }),
          });
        } catch {
          /* audit is best-effort */
        }
      }
      flow.set({ worker, request, room: picked, mode: "waiting", step: "waiting" });
      toast("Request sent. Waiting for a response.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="sg-form-grid">
      <h1>Access request</h1>
      {flow.siteName ? (
        <div className="sg-room-chip">
          <strong>{flow.siteName}</strong>
          <small>{flow.siteAddress || "Pick tower, department, then enter the room."}</small>
        </div>
      ) : null}
      {openVisit ? (
        <div className="sg-room-chip">
          <strong>You already have an approved visit on this site</strong>
          <small>Clock in or sign out instead of sending a new request.</small>
          <div className="sg-actions" style={{ marginTop: 8 }}>
            <Button
              type="button"
              variant="primary"
              onClick={() => flow.set({ request: openVisit, mode: "visit", step: "visit" })}
            >
              Clock in / sign out
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <p className="sg-error">{error}</p> : null}
      <div className="sg-form-grid two">
        <Field label="First name">
          <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
        </Field>
        <Field label="Last name">
          <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
        </Field>
      </div>
      <Field label="Company they work for">
        <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required />
      </Field>
      <Field label="Their supervisor">
        <Input
          value={form.supervisorName}
          onChange={(e) => setForm({ ...form, supervisorName: e.target.value })}
          placeholder="Name of their supervisor"
          required
        />
      </Field>
      <Field label="Type of job">
        <Select
          value={form.workType}
          onChange={(e) => setForm({ ...form, workType: e.target.value })}
          required
        >
          <option value="">Select job type</option>
          {WORK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Date on site">
        <Input
          type="date"
          value={form.workDate}
          onChange={(e) => setForm({ ...form, workDate: e.target.value })}
          required
        />
      </Field>
      <div className="sg-form-grid two">
        <Field label="From">
          <Input
            type="time"
            value={form.workFrom}
            onChange={(e) => setForm({ ...form, workFrom: e.target.value })}
            required
          />
        </Field>
        <Field label="To">
          <Input
            type="time"
            value={form.workTo}
            onChange={(e) => setForm({ ...form, workTo: e.target.value })}
            required
          />
        </Field>
      </div>
      <Field
        label="Which tower"
        hint={towers.length ? "Towers on this site." : "No towers loaded for this site yet."}
      >
        <Select
          value={form.towerId}
          onChange={(e) =>
            setForm({
              ...form,
              towerId: e.target.value,
              locationId: "",
              roomText: "",
              approverUserId: "",
            })
          }
          required
        >
          <option value="">Select tower</option>
          {towers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Department"
        hint={
          departments.length
            ? "Trade that owns this visit. That department’s manager will approve."
            : "No departments loaded for this site yet."
        }
      >
        <Select
          value={form.departmentId}
          onChange={(e) => setForm({ ...form, departmentId: e.target.value, approverUserId: "" })}
          required
        >
          <option value="">Select department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Room"
        hint={
          !form.towerId
            ? "Choose a tower first."
            : selectedLocation
              ? locationDisplay(selectedLocation)
              : "Type the apartment or riser number, for example 13.2 or E2.00.21."
        }
      >
        <Input
          value={form.roomText}
          list="sg-tower-rooms"
          onChange={(e) => setForm({ ...form, roomText: e.target.value, approverUserId: "" })}
          placeholder="e.g. 13.2"
          required
          disabled={!form.towerId}
          autoComplete="off"
        />
      </Field>
      <datalist id="sg-tower-rooms">
        {locations.map((r) => (
          <option key={r.id} value={r.roomNumber}>
            {locationDisplay(r)}
          </option>
        ))}
      </datalist>
      <Field label="What are you doing?">
        <Textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          required
        />
      </Field>
      <Field
        label="Manager to approve"
        hint={
          !form.departmentId
            ? "Choose a department first."
            : !form.locationId
              ? "Enter the room so we can load the manager for that department."
              : managers.length
                ? selectedDepartment
                  ? `Managers for ${selectedDepartment.name}.`
                  : "Managers for this department."
                : "No manager is mapped to that department yet."
        }
      >
        <Select
          value={form.approverUserId}
          onChange={(e) => setForm({ ...form, approverUserId: e.target.value })}
          required
          disabled={!form.locationId || !form.departmentId}
        >
          <option value="">Select a manager</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {`${m.firstName} ${m.lastName}`.trim() || m.email}
            </option>
          ))}
        </Select>
      </Field>
      <Button variant="primary" block disabled={busy || !form.approverUserId} type="submit">
        {busy ? "Submitting…" : "Submit form"}
      </Button>
    </form>
  );
}

function WaitingStep() {
  const flow = useWorkerFlow();
  const [status, setStatus] = useState(flow.request?.status ?? "Pending");
  const [comment, setComment] = useState("");

  useEffect(() => {
    const token = readWorkerSession()?.token;
    if (!flow.request) return;
    let stop = false;
    async function poll() {
      try {
        const rows = await api.getAccessRequests(token, {
          id: flow.request?.id,
          workerId: flow.worker?.id || undefined,
          take: 1,
        });
        const row = rows.find((r) => r.id === flow.request?.id);
        if (!row || stop) return;
        setStatus(row.status);
        flow.set({ request: row });
        if (row.status === "Approved") {
          setComment("");
          if (token) {
            try {
              const notes = await api.getNotifications(token);
              const hit = notes.find((n) => n.accessRequestId === row.id && n.type === "Approved");
              setComment(hit?.message ?? "");
            } catch {
              /* optional */
            }
          }
          flow.set({ request: row, mode: "visit", step: "visit" });
        }
        if (row.status === "Rejected") {
          const notes = await api.getNotifications(token!);
          const hit = notes.find((n) => n.accessRequestId === row.id && n.type === "Rejected");
          setComment(hit?.message ?? "The site manager declined this visit.");
        }
      } catch {
        /* keep waiting */
      }
    }
    void poll();
    const id = window.setInterval(() => void poll(), 2500);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [flow.request?.id]);

  if (status === "Rejected") {
    return (
      <div className="sg-status-hero">
        <div className="icon-wrap" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
          <X size={28} />
        </div>
        <h1>Request declined</h1>
        <p className="sg-muted">{comment || "The site manager declined this visit."}</p>
        <Button variant="primary" onClick={() => flow.set({ step: "form", request: null })}>
          Submit a new request
        </Button>
      </div>
    );
  }

  return (
    <div className="sg-status-hero">
      <div className="icon-wrap">
        <Hourglass size={28} />
      </div>
      <h1>Waiting for approval</h1>
      <p className="sg-muted">
        Your request for {locationDisplay(flow.room) || flow.siteName || "this location"} is with the
        manager. Stay on site — you will get an SMS when it is reviewed.
      </p>
      <p className="sg-help">
        Demo: open the{" "}
        <Link to="/login" style={{ textDecoration: "underline" }}>
          manager console
        </Link>{" "}
        as james.cole@sitegate.demo, approve this request, then come back here.
      </p>
    </div>
  );
}

function VisitStep() {
  const flow = useWorkerFlow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const clockedIn = Boolean(flow.request?.clockedInAt);
  const expected = flow.request?.expectedClockOutAt;

  useEffect(() => {
    if (flow.room?.id || !flow.request?.roomId || !flow.siteId) return;
    let cancelled = false;
    void locationForRequest(flow.request.roomId, {
      siteId: flow.siteId,
      siteName: flow.siteName,
      siteAddress: flow.siteAddress,
    }).then((room) => {
      if (!cancelled && room) flow.set({ room });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.request?.roomId, flow.siteId, flow.room?.id]);

  async function clockIn() {
    if (!flow.request) {
      setError("No approved visit found.");
      return;
    }
    const workerId = flow.request.workerId || flow.worker?.id || 0;
    const session = readWorkerSession();
    setBusy(true);
    setError("");
    try {
      const now = new Date();
      const expectedOut =
        flow.request.expectedClockOutAt || new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();
      await api.updateAccessRequest(session?.token, {
        id: flow.request.id,
        workerId,
        roomId: flow.request.roomId,
        status: "Approved",
        reason: flow.request.reason,
        workType: flow.request.workType,
        description: flow.request.description,
        clockedInAt: now.toISOString().slice(0, 19),
        expectedClockOutAt: expectedOut.slice(0, 19),
      });
      try {
        if (session?.token) {
          await api.insertAudit(session.token, {
            accessRequestId: flow.request.id,
            workerId,
            eventType: "ClockedIn",
            description: `${flow.worker?.firstName ?? "Worker"} ${flow.worker?.lastName ?? ""} clocked in at ${locationDisplay(flow.room)}.`,
          });
        }
      } catch {
        /* audit is best-effort */
      }
      flow.set({
        request: {
          ...flow.request,
          clockedInAt: now.toISOString(),
          expectedClockOutAt: expectedOut,
        },
      });
      toast("Clocked in");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not clock in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sg-form-grid">
      <h1>{clockedIn ? "You are on site" : "Approved visit"}</h1>
      <p className="sg-muted">
        {locationDisplay(flow.room) || flow.request?.locationLabel || flow.siteName}. Clock in when you enter, then sign out when you leave.
      </p>
      {flow.room ? (
        <div className="sg-room-chip">
          <strong>
            {locationDisplay(flow.room)}
          </strong>
          <small>{flow.room?.workAreaName ? `${flow.room.workAreaName} · ${flow.siteName}` : flow.room?.description}</small>
        </div>
      ) : null}
      {clockedIn ? (
        <div className="sg-room-chip">
          <strong>Clocked in</strong>
          <small>{whenExact(flow.request?.clockedInAt)}</small>
        </div>
      ) : null}
      {expected ? <p className="sg-help">Expected clock out {whenExact(expected)}</p> : null}
      {error ? <p className="sg-error">{error}</p> : null}
      <Button variant="primary" block disabled={busy || clockedIn} onClick={() => void clockIn()}>
        {busy ? "Clocking in…" : clockedIn ? "Already clocked in" : "Clock in"}
      </Button>
      <Button
        block
        disabled={busy}
        onClick={() => flow.set({ mode: "clockout", step: "clockout" })}
      >
        Sign out
      </Button>
      <Button type="button" onClick={() => flow.set({ step: "form", request: null, mode: "request" })}>
        New access request
      </Button>
    </div>
  );
}

function ClockOutStep() {
  const flow = useWorkerFlow();
  const [photos, setPhotos] = useState<Array<{ dataUrl: string; name: string; size: number; type: string }>>([]);
  const [photoType, setPhotoType] = useState(PHOTO_TYPES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = [...photos];
    for (const file of Array.from(list)) {
      const compressed = await compressImage(file);
      next.push(compressed);
    }
    setPhotos(next);
  }

  async function finish() {
    if (!flow.request) return;
    const workerId = flow.request.workerId || flow.worker?.id || 0;
    const session = readWorkerSession();
    const token = session?.token || "";
    setBusy(true);
    setError("");
    try {
      if (token) {
        for (const photo of photos) {
          await api.insertPhoto(token, {
            accessRequestId: flow.request.id,
            storagePath: photo.dataUrl,
            originalFileName: photo.name,
            contentType: photo.type,
            fileSize: photo.size,
            uploadedByWorkerId: workerId,
            capturedAt: new Date().toISOString(),
            photoType,
          });
        }
      }
      const now = new Date().toISOString();
      await api.updateAccessRequest(token, {
        id: flow.request.id,
        workerId,
        roomId: flow.request.roomId,
        status: "Completed",
        reason: flow.request.reason,
        workType: flow.request.workType,
        description: flow.request.description,
        clockedOutAt: now.slice(0, 19),
        completedAt: now.slice(0, 19),
      });
      try {
        if (token) {
          await api.insertAudit(token, {
            accessRequestId: flow.request.id,
            workerId,
            eventType: "ClockedOut",
            description: `${flow.worker?.firstName ?? "Worker"} ${flow.worker?.lastName ?? ""} clocked out of ${locationDisplay(flow.room)}.`,
          });
        }
      } catch {
        /* audit is best-effort */
      }
      flow.set({
        request: { ...flow.request, status: "Completed", clockedOutAt: now, completedAt: now },
        step: "done",
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not complete clock out.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sg-form-grid">
      <h1>Sign out</h1>
      <p className="sg-muted">
        Access is approved for {locationDisplay(flow.room)}. Add a photo if you can, then sign out to
        close the visit.
      </p>
      {flow.request?.clockedInAt ? (
        <div className="sg-room-chip">
          <strong>Clocked in</strong>
          <small>{whenExact(flow.request.clockedInAt)}</small>
        </div>
      ) : null}
      <Field label="Photo type">
        <Select value={photoType} onChange={(e) => setPhotoType(e.target.value)}>
          {PHOTO_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
      </Field>
      <div className="sg-photo-grid">
        {photos.map((p, i) => (
          <div className="sg-photo" key={i}>
            <img src={p.dataUrl} alt={p.name} />
          </div>
        ))}
        <label className="sg-photo sg-photo-add">
          <Camera size={20} />
          Add photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => void addFiles(e.target.files)}
          />
        </label>
      </div>
      {error ? <p className="sg-error">{error}</p> : null}
      <Button variant="primary" block disabled={busy} onClick={() => void finish()}>
        {busy ? "Signing out…" : "Sign out"}
      </Button>
      <Button type="button" onClick={() => flow.set({ step: "visit", mode: "visit" })}>
        Back
      </Button>
    </div>
  );
}

function DoneStep() {
  const flow = useWorkerFlow();
  return (
    <div className="sg-status-hero">
      <div className="icon-wrap" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>
        <Check size={28} />
      </div>
      <h1>Visit closed</h1>
      <p className="sg-muted">
        {prettyPhone(flow.phoneNumber)} · {locationDisplay(flow.room)}. Photos and times
        are stored for audit.
      </p>
      <div className="sg-cta-row">
        <Button variant="primary" onClick={() => flow.reset()}>
          New scan
        </Button>
        <Link to="/" className="sg-btn sg-btn-ghost">
          Home
        </Link>
      </div>
      <p className="sg-help" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <Clock3 size={14} /> SMS confirmation would go to the worker on a live site.
      </p>
      <p className="sg-help" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <ShieldAlert size={14} /> Do not leave plant rooms unsecured.
      </p>
    </div>
  );
}
