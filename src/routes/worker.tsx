import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
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
import { Badge, BrandMark, Button, Field, Input, Select, Textarea, toast } from "@/components/ui";
import { CameraCapture } from "@/components/CameraCapture";
import { QrImage } from "@/components/QrImage";
import { api } from "@/lib/api/client";
import { ApiError, PHOTO_TYPES, WORK_TYPES, type AccessRequest, type AccessRequestKey, type Department, type GroupRoom, type GroupRoomInput, type Room, type RoomCheck, type RoomKey, type ScanQrResult, type Site, type User, type WorkArea } from "@/lib/api/types";
import { compressImage } from "@/lib/image";
import {
  writeWorkerSession,
  readWorkerSession,
  clearWorkerSession,
  type WorkerSession,
} from "@/lib/session";
import { useWorkerFlow } from "@/lib/worker-flow";
import { prettyPhone, whenExact } from "@/lib/format";
import { localStamp, windowEnd, windowEnded } from "@/lib/visit-window";
import { locationDisplay, matchEnteredRoom, parseEnteredRoom } from "@/lib/location";
import { useMounted } from "@/lib/use-mounted";

const DEMO_SITES: Array<{ qr: string; name: string; note: string }> = [
];

const STEPS = ["phone", "otp", "form", "waiting", "visit", "clockout", "done"] as const;

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

/**
 * The verified worker session as reactive state, so a screen can tell the
 * worker their device is no longer verified *before* they do the work —
 * rather than after they have taken the photo and pressed the button.
 *
 * `refresh()` re-reads on demand and returns the fresh value, because the
 * session can lapse (TTL) while the screen sits open. The `focus` listener
 * catches the common case: the phone was locked mid-visit and is now back.
 */
function useWorkerSession(): [WorkerSession | null, () => WorkerSession | null] {
  const [session, setSession] = useState<WorkerSession | null>(() => readWorkerSession());
  const refresh = useCallback(() => {
    const next = readWorkerSession();
    setSession(next);
    return next;
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  return [session, refresh];
}

/**
 * Shown when the visit is still open but this device is not verified for it.
 * Sending the worker back to the phone step keeps `mode` intact, so verifying
 * drops them back on the screen they were on (see `OtpStep`) instead of
 * stranding them with a clocked-in visit they cannot close.
 */
function VerifyAgainNotice({ action }: { action: string }) {
  const flow = useWorkerFlow();
  return (
    <>
      <p className="sg-error">
        This device is not verified for this visit any more. Verify your phone again to
        {action} — you will come straight back here.
      </p>
      <Button
        variant="primary"
        block
        onClick={() => {
          clearWorkerSession();
          flow.set({ step: "phone" });
        }}
      >
        <ShieldAlert size={14} /> Verify phone
      </Button>
    </>
  );
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
  if (!filters.length && opts.token) filters.push({ take: 50 });
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
  const rooms = await api.listLocations(0, site.siteId).catch(() => []);
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
  const stepIndex = Math.max(
    0,
    STEPS.indexOf(flow.step === "scan" ? "phone" : (flow.step as (typeof STEPS)[number])),
  );

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
  const [sites, setSites] = useState<Site[]>([]);

  useEffect(() => {
    void api.listSites().then(setSites).catch(() => setSites([]));
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

  function pickSite(site: Site) {
    flow.set({
      qrCodeIdentifier: site.qrCodeIdentifier || "",
      room: null,
      siteId: site.id,
      siteName: site.name,
      siteAddress: site.address,
      step: "phone",
    });
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
        setCamError("This browser cannot read QR from camera. Pick a site below or skip.");
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
      setCamError("Camera is blocked in this preview. Pick a site or continue without scanning.");
    }
  }

  const picks = sites.length
    ? sites.map((s) => ({
        key: String(s.id),
        qr: s.qrCodeIdentifier || "",
        name: s.name,
        note: s.address,
        site: s,
      }))
    : DEMO_SITES.map((s) => ({ ...s, key: s.qr, site: null as Site | null }));

  return (
    <>
      <h1>Site QR is optional</h1>
      <p className="sg-muted">Skip this. You pick the site on the form.</p>
      {error ? <p className="sg-error">{error}</p> : null}
      <Button variant="primary" block disabled={busy} onClick={() => flow.set({ step: "phone" })}>
        Continue without scanning
      </Button>
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
      <Button block disabled={busy || !manual.trim()} onClick={() => void go(manual)}>
        {busy ? "Looking up…" : "Use this code"}
      </Button>
      <p className="sg-label" style={{ marginTop: 8 }}>
        Or pick the site
      </p>
      <div className="sg-room-grid">
        {picks.map((r) => (
          <button
            key={r.key}
            className="sg-room-pick"
            onClick={() => (r.site ? pickSite(r.site) : void go(r.qr))}
            disabled={busy}
          >
            {r.qr ? <QrImage value={r.qr} size={64} /> : <QrCode size={32} />}
            <div>
              <strong>{r.name}</strong>
              {r.qr ? <div className="sg-muted">{r.qr}</div> : null}
              {r.note ? <div className="sg-help">{r.note}</div> : null}
            </div>
          </button>
        ))}
      </div>
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
      <p className="sg-muted">We send a one-time code, then you pick the site, department, and room.</p>
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
        <QrCode size={14} /> Optional: scan a site QR
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
      const siteRooms = siteId ? await api.listLocations(0, siteId).catch(() => []) : [];
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
        flow.set({
          worker,
          request: activePending,
          groupId: activePending.groupId ?? 0,
          groupRooms: [],
          groupKeys: [],
          mode: "waiting",
          step: "waiting",
        });
      } else if (openVisit) {
        // A worker who was part-way through signing out and had to re-verify
        // goes back to the sign-out screen, not to the start of the visit.
        const signingOut = flow.mode === "clockout";
        flow.set({
          worker,
          request: openVisit,
          groupId: openVisit.groupId ?? 0,
          groupRooms: [],
          groupKeys: [],
          mode: signingOut ? "clockout" : "visit",
          step: signingOut ? "clockout" : "visit",
        });
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

/**
 * The earliest a worker may book: the top of the hour they are standing in.
 * Not the exact minute, so someone filling the form at 10:58 can still say
 * "10:00" for work they have the gate open for now.
 */
function currentHourHHMM(d = new Date()) {
  return `${String(d.getHours()).padStart(2, "0")}:00`;
}

function startOfCurrentHour(d = new Date()) {
  const floor = new Date(d);
  floor.setMinutes(0, 0, 0);
  return floor.getTime();
}

/** The default start: the working day, or now if the day is already under way. */
function defaultStartTime(d = new Date()) {
  const hour = currentHourHHMM(d);
  return hour > "08:00" ? hour : "08:00";
}

function placeLabel(area: WorkArea, all: WorkArea[], sites: Site[]) {
  const siteName = area.siteName || sites.find((s) => s.id === area.siteId)?.name || "";
  const siblings = all.filter((a) => a.siteId === area.siteId);
  if (!siteName) return area.name;
  if (siblings.length <= 1) return siteName;
  if (!area.name || area.name.toLowerCase() === siteName.toLowerCase()) return siteName;
  return `${siteName} · ${area.name}`;
}

/** A room the worker has added to the request, before it is sent. */
type PendingRoom = {
  key: string;
  towerId: number;
  roomId: number;
  roomText: string;
  locationKind: string;
  label: string;
  towerName: string;
  keyIds: number[];
};

function toRoomInputs(list: PendingRoom[]): GroupRoomInput[] {
  return list.map((r) => ({
    roomId: r.roomId,
    workAreaId: r.towerId,
    roomText: r.roomText,
    locationKind: r.locationKind,
    keyIds: r.keyIds,
  }));
}

function windowsText(check: RoomCheck) {
  return check.windows.length
    ? check.windows.map((w) => `${w.start}–${w.end}`).join(", ")
    : "no blackout hours today";
}

function keyReturnText(key: AccessRequestKey) {
  return key.returnBy ? `return by ${whenExact(key.returnBy)}` : "return when you leave";
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
    workFrom: defaultStartTime(),
    workTo: "17:00",
    siteId: flow.siteId ? String(flow.siteId) : "",
    towerId: flow.room?.workAreaId ? String(flow.room.workAreaId) : "",
    departmentId: "",
    roomText: flow.room?.roomNumber || flow.room?.name || "",
    locationId: flow.room?.id ? String(flow.room.id) : "",
    reason: "First fix",
    description: "",
    approverUserId: "",
  });
  const [sites, setSites] = useState<Site[]>([]);
  const [towers, setTowers] = useState<WorkArea[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [locations, setLocations] = useState<Room[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openVisit, setOpenVisit] = useState<AccessRequest | null>(null);
  const [rooms, setRooms] = useState<PendingRoom[]>([]);
  const [roomKeys, setRoomKeys] = useState<Record<number, RoomKey[]>>({});
  const [blackout, setBlackout] = useState<{ checks: RoomCheck[]; all: boolean } | null>(null);
  const siteId = Number(form.siteId) || flow.siteId || flow.room?.siteId || 0;
  const matchedRoom = matchEnteredRoom(locations, form.roomText);
  const selectedSite = sites.find((s) => s.id === siteId);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([api.listSites(), api.listTowers(0)])
      .then(([siteRows, towerRows]) => {
        if (cancelled) return;
        setSites(siteRows);
        setTowers(towerRows);
        setForm((prev) => {
          const selected = towerRows.find((t) => String(t.id) === prev.towerId);
          if (selected) return { ...prev, siteId: String(selected.siteId) };
          const scanned = flow.siteId ? towerRows.filter((t) => t.siteId === flow.siteId) : [];
          if (scanned.length === 1) {
            return { ...prev, siteId: String(scanned[0].siteId), towerId: String(scanned[0].id) };
          }
          if (flow.siteId && siteRows.some((s) => s.id === flow.siteId)) {
            return { ...prev, siteId: String(flow.siteId) };
          }
          if (towerRows.length === 1) {
            return { ...prev, siteId: String(towerRows[0].siteId), towerId: String(towerRows[0].id) };
          }
          return prev;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setSites([]);
        setTowers([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedSite || selectedSite.id === flow.siteId) return;
    flow.set({
      siteId: selectedSite.id,
      siteName: selectedSite.name,
      siteAddress: selectedSite.address,
      qrCodeIdentifier: flow.qrCodeIdentifier || selectedSite.qrCodeIdentifier || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSite?.id]);

  useEffect(() => {
    if (!siteId) {
      setDepartments([]);
      return;
    }
    let cancelled = false;
    void api.listDepartments(siteId)
      .then((deptRows) => {
        if (cancelled) return;
        setDepartments(deptRows);
        setForm((prev) => {
          const deptOk = prev.departmentId && deptRows.some((d) => String(d.id) === prev.departmentId);
          if (deptOk) return prev;
          return { ...prev, departmentId: "", approverUserId: "" };
        });
      })
      .catch(() => {
        if (!cancelled) setDepartments([]);
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
    void api.listLocations(towerId).then((rows) => {
      if (cancelled) return;
      setLocations(rows);
      setForm((prev) => {
        const stillThere = prev.locationId && rows.some((r) => String(r.id) === prev.locationId);
        if (stillThere) return prev;
        // The manager belongs to the department, not the tower, so it is kept.
        return { ...prev, locationId: "", roomText: prev.towerId === String(towerId) ? prev.roomText : "" };
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
    setForm((prev) => (prev.locationId === nextId ? prev : { ...prev, locationId: nextId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedRoom?.id, form.roomText]);

  useEffect(() => {
    const locationId = rooms[0]?.roomId || Number(form.locationId);
    const departmentId = Number(form.departmentId);
    if (!departmentId) {
      setManagers([]);
      return;
    }
    let cancelled = false;
    void api.listManagers(locationId || undefined, departmentId).then((rows) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.locationId, form.departmentId, rooms[0]?.roomId]);

  // Keys for the rooms added so far, and whether each is free for the chosen time.
  const workFromStamp = toDateTime(form.workDate, form.workFrom);
  const workToStamp = toDateTime(form.workDate, form.workTo);
  const roomIdsKey = rooms
    .map((r) => r.roomId)
    .filter(Boolean)
    .join(",");
  useEffect(() => {
    const ids = roomIdsKey ? roomIdsKey.split(",").map(Number) : [];
    if (!ids.length) {
      setRoomKeys({});
      return;
    }
    let cancelled = false;
    void Promise.all(
      ids.map((roomId) =>
        api.getKeys({ roomId, workFrom: workFromStamp, workTo: workToStamp }).catch(() => [] as RoomKey[]),
      ),
    ).then((lists) => {
      if (cancelled) return;
      const next: Record<number, RoomKey[]> = {};
      ids.forEach((id, i) => {
        next[id] = lists[i];
      });
      setRoomKeys(next);
      // A key that has since been booked by someone else is unticked.
      setRooms((prev) =>
        prev.map((r) => ({
          ...r,
          keyIds: r.keyIds.filter((k) => next[r.roomId]?.some((x) => x.id === k && x.available)),
        })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [roomIdsKey, workFromStamp, workToStamp]);

  useEffect(() => {
    const workerId = flow.worker?.id;
    if (!siteId && !workerId) return;
    let cancelled = false;
    void (async () => {
      const siteRooms = siteId ? await api.listLocations(0, siteId).catch(() => []) : [];
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

  const selectedLocation = matchedRoom || locations.find((r) => String(r.id) === form.locationId);
  const selectedTower = towers.find((t) => String(t.id) === form.towerId);
  const selectedDepartment = departments.find((d) => String(d.id) === form.departmentId);

  function currentRoomEntry(): PendingRoom | null {
    const roomText = form.roomText.trim();
    const towerId = Number(form.towerId);
    if (!towerId || !roomText) return null;
    const parsed = parseEnteredRoom(roomText);
    const match = selectedLocation;
    return {
      key: `${towerId}:${match?.id ? `id${match.id}` : roomText.toLowerCase()}`,
      towerId,
      roomId: match?.id ?? 0,
      roomText,
      locationKind: parsed.locationKind,
      label: match ? locationDisplay(match) : roomText,
      towerName: selectedTower ? placeLabel(selectedTower, towers, sites) : "",
      keyIds: [],
    };
  }

  function addRoom() {
    const entry = currentRoomEntry();
    if (!entry) {
      setError(form.towerId ? "Type the room first." : "Choose the site first.");
      return;
    }
    setRooms((prev) => (prev.some((r) => r.key === entry.key) ? prev : [...prev, entry]));
    setForm((prev) => ({ ...prev, roomText: "", locationId: "" }));
    setBlackout(null);
    setError("");
  }

  function removeRoom(key: string) {
    setRooms((prev) => prev.filter((r) => r.key !== key));
    setBlackout(null);
  }

  function toggleKey(roomKey: string, keyId: number, on: boolean) {
    setRooms((prev) =>
      prev.map((r) =>
        r.key !== roomKey
          ? r
          : { ...r, keyIds: on ? [...new Set([...r.keyIds, keyId])] : r.keyIds.filter((k) => k !== keyId) },
      ),
    );
  }

  /** The rooms added, plus one still typed in the box but not added yet. */
  function roomsToSend(): PendingRoom[] {
    const typed = currentRoomEntry();
    if (typed && !rooms.some((r) => r.key === typed.key)) return [...rooms, typed];
    return rooms;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.towerId && !rooms.length) {
      setError("Choose the site.");
      return;
    }
    if (!form.departmentId) {
      setError("Choose the department.");
      return;
    }
    const list = roomsToSend();
    const approverUserId = Number(form.approverUserId);
    if (!list.length) {
      setError("Add the room — apartment number or riser, for example 13.2.");
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
    const startAt = Date.parse(toDateTime(form.workDate, form.workFrom));
    if (Number.isFinite(startAt) && startAt < startOfCurrentHour()) {
      setError(
        `That start time has already passed. The earliest you can book is ${currentHourHHMM()} today.`,
      );
      return;
    }
    if (form.workFrom && form.workTo && form.workTo <= form.workFrom) {
      setError("The 'to' time must be after the start time.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      // Rooms in blackout hours right now: warn first, and send only the others.
      const checks = await api.checkRequestRooms(siteId, toRoomInputs(list)).catch(() => [] as RoomCheck[]);
      const blocked = checks.filter((c) => c.blocked);
      if (checks.length && blocked.length === checks.length) {
        setBlackout({ checks, all: true });
        return;
      }
      if (blocked.length) {
        setBlackout({ checks, all: false });
        return;
      }
      await send(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit.");
    } finally {
      setBusy(false);
    }
  }

  async function sendRemaining() {
    setBusy(true);
    setError("");
    try {
      await send(roomsToSend());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit.");
    } finally {
      setBusy(false);
    }
  }

  async function send(list: PendingRoom[]) {
    const approverUserId = Number(form.approverUserId);
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
    const result = await api.insertAccessRequestGroup({
      phoneNumber: flow.phoneNumber,
      workerId: worker.id,
      siteId: Number(form.siteId) || siteId,
      departmentId: Number(form.departmentId),
      rooms: toRoomInputs(list),
      reason: form.reason,
      workType: form.workType,
      description: form.description,
      supervisorName: form.supervisorName,
      workFrom,
      workTo,
      approverUserId,
    });
    const first = result.requests[0];
    if (!first?.id) throw new ApiError(500, "Could not submit.");
    const token = readWorkerSession()?.token;
    const rows = await api
      .getAccessRequests(token, { id: first.id, workerId: worker.id, take: 1 })
      .catch(() => [] as AccessRequest[]);
    const request: AccessRequest = rows.find((r) => r.id === first.id) ?? {
      id: first.id,
      workerId: worker.id,
      roomId: first.roomId,
      status: "Pending",
      reason: form.reason,
      workType: form.workType,
      description: form.description,
      supervisorName: form.supervisorName,
      workFrom,
      workTo,
      approvedAt: null,
      rejectedAt: null,
      clockedInAt: null,
      expectedClockOutAt: workTo,
      clockedOutAt: null,
      completedAt: null,
      createdAt: localStamp(),
      groupId: result.groupId,
      groupSize: result.requests.length,
    };
    const firstRoom = list.find((r) => r.roomId === first.roomId) ?? list[0];
    const firstTower = towers.find((t) => t.id === firstRoom.towerId);
    const knownRoom = locations.find((r) => r.id === first.roomId);
    const parsed = parseEnteredRoom(firstRoom.roomText);
    const picked: ScanQrResult = knownRoom
      ? {
          ...knownRoom,
          workAreaName: firstTower?.name ?? "",
          siteName: selectedSite?.name || flow.siteName,
          siteId,
          siteAddress: selectedSite?.address || flow.siteAddress,
          scanKind: "room",
        }
      : {
          id: first.roomId,
          workAreaId: firstRoom.towerId,
          roomNumber: parsed.roomNumber,
          name: parsed.name,
          qrCodeIdentifier: flow.qrCodeIdentifier || "",
          description: "",
          isActive: true,
          locationKind: parsed.locationKind,
          workAreaName: firstTower?.name ?? "",
          siteName: selectedSite?.name || flow.siteName,
          siteId,
          siteAddress: selectedSite?.address || flow.siteAddress,
          scanKind: "room",
        };
    flow.set({
      worker,
      request,
      groupId: result.groupId,
      groupRooms: [],
      groupKeys: [],
      room: picked,
      mode: "waiting",
      step: "waiting",
    });
    setBlackout(null);
    const count = result.requests.length;
    toast(
      result.skipped.length
        ? `Request sent for ${count} room${count === 1 ? "" : "s"}. ${result.skipped.length} in blackout hours ${result.skipped.length === 1 ? "was" : "were"} left out.`
        : count > 1
          ? `Request sent for ${count} rooms. Waiting for a response.`
          : "Request sent. Waiting for a response.",
    );
  }

  return (
    <form onSubmit={submit} className="sg-form-grid">
      <h1>Access request</h1>
      {selectedTower || selectedSite || flow.siteName ? (
        <div className="sg-room-chip">
          <strong>
            {selectedTower
              ? placeLabel(selectedTower, towers, sites)
              : selectedSite?.name || flow.siteName}
          </strong>
          <small>{selectedSite?.address || flow.siteAddress || "Pick department, then enter the room."}</small>
        </div>
      ) : (
        <p className="sg-muted">Pick the site, department, then type the room. No QR needed.</p>
      )}
      {openVisit ? (
        <div className="sg-room-chip">
          <strong>You already have an approved visit on this site</strong>
          <small>Clock in or sign out instead of sending a new request.</small>
          <div className="sg-actions" style={{ marginTop: 8 }}>
            <Button
              type="button"
              variant="primary"
              onClick={() =>
                flow.set({ request: openVisit, groupId: openVisit.groupId ?? 0, groupRooms: [], groupKeys: [], mode: "visit", step: "visit" })
              }
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
          min={todayIsoDate()}
          value={form.workDate}
          onChange={(e) => setForm({ ...form, workDate: e.target.value })}
          required
        />
      </Field>
      <div className="sg-form-grid two">
        <Field label="From">
          <Input
            type="time"
            // Deliberately no `min`: the browser would block the submit with its
            // own tooltip and the worker would never see the form's own message,
            // which says what the earliest start actually is.
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
        label="Which site"
        hint={towers.length ? "Where you are working today." : "No sites loaded yet."}
      >
        <Select
          value={form.towerId}
          onChange={(e) => {
            const tower = towers.find((t) => String(t.id) === e.target.value);
            const sameSite = Boolean(tower) && String(tower?.siteId) === form.siteId;
            // Rooms from several towers of one site can go in one request; a different site starts again.
            if (!sameSite) setRooms([]);
            setBlackout(null);
            setForm({
              ...form,
              towerId: e.target.value,
              siteId: tower ? String(tower.siteId) : "",
              departmentId: sameSite ? form.departmentId : "",
              locationId: "",
              roomText: "",
              approverUserId: sameSite ? form.approverUserId : "",
            });
          }}
          required={!rooms.length}
        >
          <option value="">Select site</option>
          {towers.map((t) => (
            <option key={t.id} value={t.id}>
              {placeLabel(t, towers, sites)}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Department"
        hint={
          !form.siteId
            ? "Choose a site first."
            : departments.length
              ? "Trade that owns this visit. That department’s manager will approve."
              : "No departments loaded for this site yet."
        }
      >
        <Select
          value={form.departmentId}
          onChange={(e) => setForm({ ...form, departmentId: e.target.value, approverUserId: "" })}
          required
          disabled={!form.siteId}
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
        label={rooms.length ? "Add another room" : "Room"}
        hint={
          !form.towerId
            ? "Choose a site first."
            : selectedLocation
              ? locationDisplay(selectedLocation)
              : form.roomText.trim()
                ? "Not in the list yet — we will add it to this site when you submit."
                : "Type the apartment or riser number, for example 13.2 or E2.00.21. Add as many rooms as you need."
        }
      >
        <div className="sg-row-inline">
          <Input
            value={form.roomText}
            list="sg-tower-rooms"
            onChange={(e) => setForm({ ...form, roomText: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addRoom();
              }
            }}
            placeholder="e.g. 13.2"
            required={!rooms.length}
            disabled={!form.towerId}
            autoComplete="off"
          />
          <Button type="button" onClick={addRoom} disabled={!form.towerId || !form.roomText.trim()}>
            Add room
          </Button>
        </div>
      </Field>
      <datalist id="sg-tower-rooms">
        {locations.map((r) => (
          <option key={r.id} value={r.roomNumber}>
            {locationDisplay(r)}
          </option>
        ))}
      </datalist>
      {rooms.length ? (
        <div className="sg-room-grid">
          {rooms.map((r) => {
            const keys = r.roomId ? roomKeys[r.roomId] ?? [] : [];
            return (
              <div className="sg-room-chip" key={r.key}>
                <div className="sg-room-chip-head">
                  <strong>{r.label}</strong>
                  <Button type="button" onClick={() => removeRoom(r.key)}>
                    Remove
                  </Button>
                </div>
                {r.towerName ? <small>{r.towerName}</small> : null}
                {keys.length ? (
                  <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                    <small>Keys you need for this room</small>
                    {keys.map((k) => (
                      <label className="sg-key-option" key={k.id}>
                        <input
                          type="checkbox"
                          checked={r.keyIds.includes(k.id)}
                          disabled={!k.available}
                          onChange={(e) => toggleKey(r.key, k.id, e.target.checked)}
                        />
                        <span>
                          {k.label}
                          {k.tagNumber ? ` (${k.tagNumber})` : ""}
                          {k.available ? "" : " — already booked or out for that time"}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : r.roomId ? null : (
                  <small>New room: no keys are registered for it yet.</small>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
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
          disabled={!form.departmentId}
        >
          <option value="">Select a manager</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {`${m.firstName} ${m.lastName}`.trim() || m.email}
            </option>
          ))}
        </Select>
      </Field>
      {blackout ? (
        <div className={`sg-room-chip ${blackout.all ? "is-danger" : "is-warn"}`} role="alert">
          <strong>
            {blackout.all
              ? "All of these rooms are in blackout hours right now"
              : "Some of these rooms are in blackout hours right now"}
          </strong>
          <small>
            {blackout.all
              ? "Nothing can be sent until a blackout ends. Blackout hours for each room today:"
              : "Only the rooms not within their blackout hours will go through. Blackout hours for each room today:"}
          </small>
          <ul className="sg-list-plain">
            {blackout.checks.map((c, i) => (
              <li key={`${c.roomId}-${i}`}>
                <strong>{c.label}</strong>
                {c.workAreaName ? ` (${c.workAreaName})` : ""}: {windowsText(c)}{" "}
                {c.blocked ? <Badge tone="danger">In blackout now</Badge> : <Badge tone="ok">Will be sent</Badge>}
              </li>
            ))}
          </ul>
          <div className="sg-actions" style={{ marginTop: 8 }}>
            {blackout.all ? null : (
              <Button type="button" variant="primary" disabled={busy} onClick={() => void sendRemaining()}>
                {busy ? "Submitting…" : `Send for the other ${blackout.checks.filter((c) => !c.blocked).length} room(s)`}
              </Button>
            )}
            <Button type="button" onClick={() => setBlackout(null)}>
              Change rooms
            </Button>
          </div>
        </div>
      ) : null}
      <Button variant="primary" block disabled={busy || !form.approverUserId || Boolean(blackout)} type="submit">
        {busy ? "Submitting…" : rooms.length > 1 ? `Submit request for ${roomsToSend().length} rooms` : "Submit form"}
      </Button>
    </form>
  );
}

function SingleWaitingStep() {
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
    const id = window.setInterval(() => void poll(), 10000);
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

function WaitingStep() {
  const flow = useWorkerFlow();
  const groupId = flow.groupId || flow.request?.groupId || 0;
  return groupId ? <GroupWaitingStep groupId={groupId} /> : <SingleWaitingStep />;
}

function statusTone(status: string): "ok" | "warn" | "danger" | "accent" | "muted" {
  if (/^approved$/i.test(status)) return "ok";
  if (/^(rejected|cancelled)$/i.test(status)) return "danger";
  if (/^completed$/i.test(status)) return "accent";
  return "warn";
}

function roomName(r: { roomName?: string; roomNumber?: string }) {
  return r.roomName || r.roomNumber || "Room";
}

/** Load the worker's group into the flow. */
async function loadGroup(groupId: number, workerId: number) {
  const token = readWorkerSession()?.token;
  return api.getAccessRequestGroup(token, groupId, workerId);
}

function GroupWaitingStep({ groupId }: { groupId: number }) {
  const flow = useWorkerFlow();
  const [message, setMessage] = useState("");

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const token = readWorkerSession()?.token;
        const workerId = flow.worker?.id || flow.request?.workerId || 0;
        const group = await loadGroup(groupId, workerId);
        if (stop) return;
        flow.set({ groupId, groupRooms: group.rooms, groupKeys: group.keys });
        if (group.rooms.some((r) => /^pending$/i.test(String(r.status)))) return;

        // Every room is decided: the worker gets one message for the whole request.
        if (token) {
          try {
            const ids = new Set(group.rooms.map((r) => r.accessRequestId));
            const notes = await api.getNotifications(token);
            const hit = notes.find(
              (n) => n.accessRequestId != null && ids.has(n.accessRequestId) && /^(approved|rejected)$/i.test(n.type),
            );
            if (hit && !stop) setMessage(hit.message);
          } catch {
            /* optional */
          }
        }
        const approved = group.rooms.find((r) => /^approved$/i.test(String(r.status)));
        if (approved && !stop) {
          const rows = await api
            .getAccessRequests(token, { id: approved.accessRequestId, workerId: workerId || undefined, take: 1 })
            .catch(() => [] as AccessRequest[]);
          const row = rows.find((r) => r.id === approved.accessRequestId);
          flow.set({ request: row ?? flow.request, mode: "visit", step: "visit" });
        }
      } catch {
        /* keep waiting */
      }
    }
    void poll();
    const id = window.setInterval(() => void poll(), 10000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const rooms = flow.groupRooms.filter((r) => r.groupId === groupId);
  const decided = rooms.length > 0 && !rooms.some((r) => /^pending$/i.test(String(r.status)));
  const allDeclined = decided && rooms.every((r) => !/^approved$/i.test(String(r.status)));

  const list = rooms.length ? (
    <ul className="sg-list-plain" style={{ textAlign: "left" }}>
      {rooms.map((r) => (
        <li key={r.accessRequestId}>
          <strong>{roomName(r)}</strong>
          {r.workAreaName ? ` (${r.workAreaName})` : ""}{" "}
          <Badge tone={statusTone(String(r.status))}>{String(r.status)}</Badge>
          {r.comment && !/^approved$/i.test(String(r.status)) ? <div className="sg-help">{r.comment}</div> : null}
        </li>
      ))}
    </ul>
  ) : null;

  if (allDeclined) {
    return (
      <div className="sg-status-hero">
        <div className="icon-wrap" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
          <X size={28} />
        </div>
        <h1>Request declined</h1>
        <p className="sg-muted">{message || "The site manager declined this visit."}</p>
        {list}
        <Button
          variant="primary"
          onClick={() => flow.set({ step: "form", request: null, groupId: 0, groupRooms: [], groupKeys: [] })}
        >
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
        {rooms.length > 1
          ? `Your request for ${rooms.length} rooms is with the manager. Each room is approved or declined on its own; you will get one SMS when they have all been reviewed.`
          : `Your request for ${locationDisplay(flow.room) || flow.siteName || "this location"} is with the manager. Stay on site — you will get an SMS when it is reviewed.`}
      </p>
      {list}
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

/** One approved room of the visit, from the group or (older requests) the single request. */
type VisitRoom = {
  accessRequestId: number;
  roomId: number;
  label: string;
  workerId: number;
  reason: string;
  workType: string;
  description: string;
  clockedInAt: string | null;
  clockedOutAt: string | null;
  completedAt: string | null;
};

function useVisitRooms(): VisitRoom[] {
  const flow = useWorkerFlow();
  const groupId = flow.groupId || flow.request?.groupId || 0;
  const fromGroup = groupId
    ? flow.groupRooms.filter(
        (r: GroupRoom) => r.groupId === groupId && (/^(approved|completed)$/i.test(String(r.status)) || r.clockedInAt),
      )
    : [];
  if (fromGroup.length) {
    return fromGroup.map((r) => ({
      accessRequestId: r.accessRequestId,
      roomId: r.roomId,
      label: `${roomName(r)}${r.workAreaName ? ` · ${r.workAreaName}` : ""}`,
      workerId: r.workerId,
      reason: r.reason,
      workType: r.workType,
      description: r.description,
      clockedInAt: r.clockedInAt,
      clockedOutAt: r.clockedOutAt,
      completedAt: r.completedAt,
    }));
  }
  const q = flow.request;
  if (!q) return [];
  return [
    {
      accessRequestId: q.id,
      roomId: q.roomId,
      label: locationDisplay(flow.room) || q.locationLabel || q.roomName || q.roomNumber || "Room",
      workerId: q.workerId,
      reason: q.reason,
      workType: q.workType,
      description: q.description,
      clockedInAt: q.clockedInAt,
      clockedOutAt: q.clockedOutAt,
      completedAt: q.completedAt,
    },
  ];
}

/** Loads the group when a visit is resumed (after re-verifying) and the rooms are not in memory yet. */
function useEnsureGroupLoaded() {
  const flow = useWorkerFlow();
  const groupId = flow.groupId || flow.request?.groupId || 0;
  const loaded = flow.groupRooms.some((r) => r.groupId === groupId);
  useEffect(() => {
    if (!groupId || loaded) return;
    let cancelled = false;
    void loadGroup(groupId, flow.worker?.id || flow.request?.workerId || 0)
      .then((group) => {
        if (!cancelled) flow.set({ groupId, groupRooms: group.rooms, groupKeys: group.keys });
      })
      .catch(() => {
        /* the single request still works */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, loaded]);
}

function KeysPanel({ keys, leaving }: { keys: AccessRequestKey[]; leaving?: boolean }) {
  const open = keys.filter((k) => /^(approved|issued|missing)$/i.test(String(k.status)));
  if (!open.length) return null;
  return (
    <div className="sg-room-chip">
      <strong>{leaving ? "Return your keys to the Keyman" : "Keys"}</strong>
      <ul className="sg-list-plain">
        {open.map((k) => (
          <li key={k.id}>
            <strong>{k.keyLabel}</strong> for {k.roomName || k.roomNumber} —{" "}
            {/^approved$/i.test(String(k.status)) ? "collect from the Keyman, " : ""}
            {keyReturnText(k)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function VisitStep() {
  const flow = useWorkerFlow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [session, refreshSession] = useWorkerSession();
  useEnsureGroupLoaded();
  const rooms = useVisitRooms();
  const open = rooms.filter((r) => !r.completedAt && !r.clockedOutAt);
  const clockedIn = open.length > 0 && open.every((r) => Boolean(r.clockedInAt));
  const expected = flow.request?.workTo || flow.request?.expectedClockOutAt;
  const expired = flow.request ? windowEnded(flow.request) : false;

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

  /** One clock-in covers every approved room of the request. */
  async function clockIn() {
    if (!flow.request || !open.length) {
      setError("No approved visit found.");
      return;
    }
    // Check the verification here rather than letting the call go out anyway:
    // `updateAccessRequest` accepts a tokenless clock-in, which would hide a
    // lapsed session until the worker tried to sign out at the end of the
    // shift — which is where this used to fail.
    const current = refreshSession();
    if (!current) {
      setError("");
      return;
    }
    if (windowEnded(flow.request)) {
      setError("Your approved time frame has ended. Contact your site manager.");
      return;
    }
    const token = current.token?.trim() || "";
    setBusy(true);
    setError("");
    try {
      const now = new Date();
      const stamp = localStamp(now);
      const expectedOut =
        flow.request.expectedClockOutAt || localStamp(new Date(now.getTime() + 8 * 60 * 60 * 1000));
      for (const room of open.filter((r) => !r.clockedInAt)) {
        const workerId = room.workerId || flow.worker?.id || 0;
        await api.updateAccessRequest(token, {
          id: room.accessRequestId,
          workerId,
          roomId: room.roomId,
          status: "Approved",
          reason: room.reason,
          workType: room.workType,
          description: room.description,
          clockedInAt: stamp,
          expectedClockOutAt: expectedOut.slice(0, 19),
        });
        try {
          await api.insertAudit(token, {
            accessRequestId: room.accessRequestId,
            workerId,
            eventType: "ClockedIn",
            description: `${flow.worker?.firstName ?? "Worker"} ${flow.worker?.lastName ?? ""} clocked in at ${room.label}.`,
          });
        } catch {
          /* audit is best-effort */
        }
      }
      const ids = new Set(open.map((r) => r.accessRequestId));
      flow.set({
        request: { ...flow.request, clockedInAt: stamp, expectedClockOutAt: expectedOut },
        groupRooms: flow.groupRooms.map((r) =>
          ids.has(r.accessRequestId) && !r.clockedInAt ? { ...r, clockedInAt: stamp } : r,
        ),
      });
      toast(open.length > 1 ? `Clocked in to ${open.length} rooms` : "Clocked in");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not clock in.");
    } finally {
      setBusy(false);
    }
  }

  const declined = flow.groupRooms.filter(
    (r) => r.groupId === (flow.groupId || flow.request?.groupId) && /^(rejected|cancelled)$/i.test(String(r.status)),
  );

  return (
    <div className="sg-form-grid">
      <h1>{clockedIn ? "You are on site" : "Approved visit"}</h1>
      <p className="sg-muted">
        {rooms.length > 1
          ? `Approved for ${rooms.length} rooms. Clock in once when you arrive, then sign out once when you leave.`
          : `${locationDisplay(flow.room) || flow.request?.locationLabel || flow.siteName}. Clock in when you enter, then sign out when you leave.`}
      </p>
      {rooms.length > 1 ? (
        <div className="sg-room-chip">
          <strong>Approved rooms</strong>
          <ul className="sg-list-plain">
            {rooms.map((r) => (
              <li key={r.accessRequestId}>{r.label}</li>
            ))}
          </ul>
          {declined.length ? (
            <small>
              Not approved: {declined.map((r) => `${roomName(r)}${r.comment ? ` (${r.comment})` : ""}`).join(", ")}
            </small>
          ) : null}
        </div>
      ) : flow.room ? (
        <div className="sg-room-chip">
          <strong>{locationDisplay(flow.room)}</strong>
          <small>{flow.room?.workAreaName ? `${flow.room.workAreaName} · ${flow.siteName}` : flow.room?.description}</small>
        </div>
      ) : null}
      <KeysPanel keys={flow.groupKeys} />
      {clockedIn ? (
        <div className="sg-room-chip">
          <strong>Clocked in</strong>
          <small>{whenExact(open[0]?.clockedInAt || flow.request?.clockedInAt)}</small>
        </div>
      ) : null}
      {expected ? <p className="sg-help">Expected clock out {whenExact(expected)}</p> : null}
      {expired ? (
        <p className="sg-error">
          Overdue: your approved time frame ended at {whenExact(expected)}. You can no longer clock in or
          sign out here. Contact your site manager to be signed out.
        </p>
      ) : null}
      {error ? <p className="sg-error">{error}</p> : null}
      {session ? null : <VerifyAgainNotice action={clockedIn ? "sign out" : "clock in"} />}
      <Button
        variant="primary"
        block
        disabled={busy || clockedIn || !session || expired || !open.length}
        onClick={() => void clockIn()}
      >
        {busy ? "Clocking in…" : clockedIn ? "Already clocked in" : "Clock in"}
      </Button>
      <Button
        block
        disabled={busy || !session || expired || !open.length}
        onClick={() => flow.set({ mode: "clockout", step: "clockout" })}
      >
        Sign out
      </Button>
      <Button
        type="button"
        onClick={() => flow.set({ step: "form", request: null, groupId: 0, groupRooms: [], groupKeys: [], mode: "request" })}
      >
        New access request
      </Button>
    </div>
  );
}

type CapturedPhoto = { dataUrl: string; name: string; size: number; type: string };

function ClockOutStep() {
  const flow = useWorkerFlow();
  useEnsureGroupLoaded();
  const rooms = useVisitRooms().filter((r) => !r.completedAt && !r.clockedOutAt);
  const [photos, setPhotos] = useState<Record<number, CapturedPhoto[]>>({});
  const [target, setTarget] = useState(0);
  const [photoType, setPhotoType] = useState(PHOTO_TYPES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [session, refreshSession] = useWorkerSession();
  const current = rooms.find((r) => r.accessRequestId === target) ?? rooms[0];

  /** One sign-out covers every room; each room still gets its own photos for the Keyman. */
  async function finish() {
    if (!flow.request || !rooms.length) return;
    if (windowEnded(flow.request)) {
      const end = windowEnd(flow.request);
      setError(
        `Your approved time frame ended at ${whenExact(end != null ? localStamp(new Date(end)) : null)}. ` +
          "This visit is overdue. Contact your site manager to be signed out.",
      );
      return;
    }
    const missing = rooms.filter((r) => !(photos[r.accessRequestId]?.length));
    if (missing.length) {
      setError(
        rooms.length > 1
          ? `Take a photo of every room before you sign out. Still needed: ${missing.map((r) => r.label).join(", ")}.`
          : "Take a photo of the room before you sign out.",
      );
      if (missing[0]) setTarget(missing[0].accessRequestId);
      return;
    }
    // Re-read rather than trusting the render-time value: the session can
    // lapse while this screen is open waiting for a photo.
    const fresh = refreshSession();
    if (!fresh) {
      setError("");
      return;
    }
    const freshToken = fresh.token?.trim() || "";
    setBusy(true);
    setError("");
    try {
      const now = localStamp();
      for (const room of rooms) {
        const workerId = room.workerId || flow.worker?.id || 0;
        for (const photo of photos[room.accessRequestId] ?? []) {
          await api.insertPhoto(freshToken, {
            accessRequestId: room.accessRequestId,
            photoType,
            uploadedByWorkerId: workerId,
            dataUrl: photo.dataUrl,
            fileName: photo.name,
          });
        }
        await api.updateAccessRequest(freshToken, {
          id: room.accessRequestId,
          workerId,
          roomId: room.roomId,
          status: "Completed",
          reason: room.reason,
          workType: room.workType,
          description: room.description,
          clockedOutAt: now,
          completedAt: now,
        });
        try {
          await api.insertAudit(freshToken, {
            accessRequestId: room.accessRequestId,
            workerId,
            eventType: "ClockedOut",
            description: `${flow.worker?.firstName ?? "Worker"} ${flow.worker?.lastName ?? ""} clocked out of ${room.label}.`,
          });
        } catch {
          /* audit is best-effort */
        }
      }
      const ids = new Set(rooms.map((r) => r.accessRequestId));
      flow.set({
        request: { ...flow.request, status: "Completed", clockedOutAt: now, completedAt: now },
        groupRooms: flow.groupRooms.map((r) =>
          ids.has(r.accessRequestId) ? { ...r, status: "Completed", clockedOutAt: now, completedAt: now } : r,
        ),
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
        {rooms.length > 1
          ? `Take a live photo of each of your ${rooms.length} rooms, then sign out once. You cannot pick one from the gallery.`
          : `Access is approved for ${rooms[0]?.label || locationDisplay(flow.room)}. Take a live photo of the room, then sign out. You cannot pick one from the gallery.`}
      </p>
      {flow.request?.clockedInAt ? (
        <div className="sg-room-chip">
          <strong>Clocked in</strong>
          <small>{whenExact(flow.request.clockedInAt)}</small>
        </div>
      ) : null}
      {rooms.length > 1 ? (
        <Field label="Photos for">
          <Select value={current?.accessRequestId ?? 0} onChange={(e) => setTarget(Number(e.target.value))}>
            {rooms.map((r) => (
              <option key={r.accessRequestId} value={r.accessRequestId}>
                {r.label} — {photos[r.accessRequestId]?.length ?? 0} photo(s)
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Photo type">
        <Select value={photoType} onChange={(e) => setPhotoType(e.target.value)}>
          {PHOTO_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
      </Field>
      <div className="sg-photo-grid">
        {(current ? photos[current.accessRequestId] ?? [] : []).map((p, i) => (
          <div className="sg-photo" key={i}>
            <img src={p.dataUrl} alt={p.name} />
          </div>
        ))}
      </div>
      <CameraCapture
        onCapture={(photo) => {
          if (!current) return;
          setPhotos((prev) => ({
            ...prev,
            [current.accessRequestId]: [...(prev[current.accessRequestId] ?? []), photo],
          }));
          setError("");
        }}
      />
      <KeysPanel keys={flow.groupKeys} leaving />
      {error ? <p className="sg-error">{error}</p> : null}
      {session ? null : <VerifyAgainNotice action="sign out" />}
      <Button variant="primary" block disabled={busy || !session || !rooms.length} onClick={() => void finish()}>
        {busy ? "Signing out…" : rooms.length > 1 ? `Sign out of ${rooms.length} rooms` : "Sign out"}
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
        are stored for audit, and the Keyman has been asked to check the room.
      </p>
      <KeysPanel keys={flow.groupKeys} leaving />
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
