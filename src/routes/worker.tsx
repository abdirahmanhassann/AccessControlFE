import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  Clock3,
  Hourglass,
  QrCode,
  ShieldAlert,
  X,
} from "lucide-react";
import { BrandMark, Button, Field, Input, Select, Textarea, toast } from "@/components/ui";
import { QrImage } from "@/components/QrImage";
import { api } from "@/lib/api/client";
import { ApiError, PHOTO_TYPES, WORK_TYPES } from "@/lib/api/types";
import { compressImage } from "@/lib/image";
import { writeWorkerSession, readWorkerSession } from "@/lib/session";
import { useWorkerFlow } from "@/lib/worker-flow";
import { prettyPhone, whenExact } from "@/lib/format";
import { useMounted } from "@/lib/use-mounted";

const DEMO_ROOMS = [
  { qr: "SG-RIV-A101", room: "A-101", name: "Plant room", site: "Riverside Tower" },
  { qr: "SG-RIV-A204", room: "A-204", name: "Electrical riser", site: "Riverside Tower" },
  { qr: "SG-RIV-GF12", room: "GF-12", name: "Comms room", site: "Riverside Tower", note: "Demo clock-out for 07700 900123" },
  { qr: "SG-RIV-A310", room: "A-310", name: "Roof access", site: "Riverside Tower" },
  { qr: "SG-OAK-NW04", room: "NW-04", name: "Plant corridor", site: "Oakridge Mixed-Use" },
];

const STEPS = ["scan", "phone", "otp", "form", "waiting", "clockout", "done"] as const;

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
        <button className="sg-btn sg-btn-ghost sg-btn-sm" onClick={() => flow.reset()}>
          Start over
        </button>
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

  async function go(qr: string) {
    setBusy(true);
    setError("");
    try {
      const room = await api.scanQr(qr.trim());
      flow.set({ qrCodeIdentifier: room.qrCodeIdentifier, room, step: "phone" });
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
        setCamError("This browser cannot read QR from camera. Pick a demo room or type the code.");
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
      setCamError("Camera is blocked in this preview. Use a demo room below.");
    }
  }

  return (
    <>
      <h1>Scan the room QR</h1>
      <p className="sg-muted">Point at the code on the door, or pick a demo room on this site.</p>
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
          placeholder="SG-RIV-A101"
        />
      </Field>
      <Button variant="primary" block disabled={busy || !manual.trim()} onClick={() => void go(manual)}>
        {busy ? "Looking up…" : "Continue"}
      </Button>
      <p className="sg-label" style={{ marginTop: 8 }}>
        Demo rooms
      </p>
      <div className="sg-room-grid">
        {DEMO_ROOMS.map((r) => (
          <button key={r.qr} className="sg-room-pick" onClick={() => void go(r.qr)} disabled={busy}>
            <QrImage value={r.qr} size={64} />
            <div>
              <strong>
                {r.room} {r.name}
              </strong>
              <div className="sg-muted">{r.site}</div>
              {r.note ? <div className="sg-help">{r.note}</div> : null}
            </div>
            <QrCode size={16} />
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
      <p className="sg-muted">We send a one-time code to this number.</p>
      {flow.room ? (
        <div className="sg-room-chip">
          <strong>
            {flow.room.roomNumber} {flow.room.name}
          </strong>
          <small>
            {flow.room.siteName} · {flow.room.workAreaName}
          </small>
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
      let worker = result.worker;
      if (!worker) {
        worker = await api.insertWorker({
          phoneNumber: flow.phoneNumber,
          firstName: "",
          lastName: "",
          companyName: "",
        });
      }
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
      const token = session?.token ?? result.token;
      if (token) {
        const requests = await api.getAccessRequests(token);
        const roomId = Number(flow.room?.id ?? (flow.room as { roomId?: number } | null)?.roomId ?? 0);
        const active = requests.find(
          (r) => r.roomId === roomId && (r.status === "Pending" || r.status === "Approved"),
        );
        if (active?.status === "Pending") {
          flow.set({ worker, request: active, mode: "waiting", step: "waiting" });
        } else if (active?.status === "Approved") {
          flow.set({ worker, request: active, mode: "clockout", step: "clockout" });
        } else {
          flow.set({ worker, request: null, mode: "request", step: "form" });
        }
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

function FormStep() {
  const flow = useWorkerFlow();
  const [form, setForm] = useState({
    firstName: flow.worker?.firstName ?? "",
    lastName: flow.worker?.lastName ?? "",
    companyName: flow.worker?.companyName ?? "",
    workType: WORK_TYPES[0],
    reason: "First fix",
    description: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const roomId = Number(flow.room?.id ?? (flow.room as { roomId?: number } | null)?.roomId ?? 0);
    if (!flow.room || !roomId) {
      setError("Room is missing. Go back and scan the QR again.");
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
      const request = await api.insertAccessRequest({
        phoneNumber: flow.phoneNumber,
        workerId: worker.id,
        roomId,
        reason: form.reason,
        workType: form.workType,
        description: form.description,
      });
      flow.set({ worker, request, mode: "waiting", step: "waiting" });
      toast("Request sent to the site manager");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="sg-form-grid">
      <h1>Access request</h1>
      {flow.room ? (
        <div className="sg-room-chip">
          <strong>
            {flow.room.roomNumber} {flow.room.name}
          </strong>
          <small>{flow.room.description}</small>
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
      <Field label="Company">
        <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required />
      </Field>
      <Field label="Work type">
        <Select value={form.workType} onChange={(e) => setForm({ ...form, workType: e.target.value })}>
          {WORK_TYPES.map((w) => (
            <option key={w}>{w}</option>
          ))}
        </Select>
      </Field>
      <Field label="Reason">
        <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
      </Field>
      <Field label="What are you doing in the room?">
        <Textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          required
        />
      </Field>
      <Button variant="primary" block disabled={busy} type="submit">
        {busy ? "Submitting…" : "Send for approval"}
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
    if (!token || !flow.request) return;
    let stop = false;
    async function poll() {
      try {
        const rows = await api.getAccessRequests(token!);
        const row = rows.find((r) => r.id === flow.request?.id);
        if (!row || stop) return;
        setStatus(row.status);
        flow.set({ request: row });
        if (row.status === "Approved") {
          const notes = await api.getNotifications(token!);
          const hit = notes.find((n) => n.accessRequestId === row.id && n.type === "Approved");
          setComment(hit?.message ?? "");
          flow.set({ request: row, mode: "clockout", step: "clockout" });
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
        Your request for {flow.room?.roomNumber} is with the site manager. Stay near the door — you
        will get an SMS when it is reviewed.
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
    const session = readWorkerSession();
    if (!session || !flow.request || !flow.worker) return;
    if (!photos.length) {
      setError("Take at least one photo of the room before you leave.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      for (const photo of photos) {
        await api.insertPhoto(session.token, {
          accessRequestId: flow.request.id,
          storagePath: photo.dataUrl,
          originalFileName: photo.name,
          contentType: photo.type,
          fileSize: photo.size,
          uploadedByWorkerId: flow.worker.id,
          capturedAt: new Date().toISOString(),
          photoType,
        });
      }
      const now = new Date().toISOString();
      await api.updateAccessRequest(session.token, {
        id: flow.request.id,
        workerId: flow.request.workerId,
        roomId: flow.request.roomId,
        status: "Completed",
        reason: flow.request.reason,
        workType: flow.request.workType,
        description: flow.request.description,
        clockedOutAt: now,
        completedAt: now,
      });
      await api.insertAudit(session.token, {
        accessRequestId: flow.request.id,
        workerId: flow.worker.id,
        eventType: "ClockedOut",
        description: `${flow.worker.firstName} ${flow.worker.lastName} clocked out of ${flow.room?.roomNumber ?? "room"}.`,
      });
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
      <h1>Clock out</h1>
      <p className="sg-muted">
        Access is approved for {flow.room?.roomNumber}. Photograph the room as you leave, then close
        the visit.
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
        {busy ? "Closing visit…" : "Clock out"}
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
        {prettyPhone(flow.phoneNumber)} · {flow.room?.roomNumber} {flow.room?.name}. Photos and times
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
