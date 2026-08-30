import {
  ApiError,
  type AccessPhoto,
  type AccessRequest,
  type AccessRequestApproval,
  type AccessWindow,
  type AuditEvent,
  type Notification,
  type OTPVerification,
  type Room,
  type ScanQrResult,
  type Session,
  type Site,
  type User,
  type WorkArea,
  type WorkAreaManager,
  type Worker,
} from "./types";

const KEY = "sitegate.db.v2";

type Db = {
  users: User[];
  passwords: Record<string, string>;
  sites: Site[];
  workAreas: WorkArea[];
  rooms: Room[];
  workers: Worker[];
  workAreaManagers: WorkAreaManager[];
  windows: AccessWindow[];
  requests: AccessRequest[];
  approvals: AccessRequestApproval[];
  photos: AccessPhoto[];
  otps: OTPVerification[];
  notifications: Notification[];
  audits: AuditEvent[];
  sessions: Session[];
  seq: Record<string, number>;
};

function iso(msOffset = 0) {
  return new Date(Date.now() + msOffset).toISOString();
}

function hoursAgo(h: number) {
  return iso(-h * 3600_000);
}

function seed(): Db {
  const users: User[] = [
    {
      id: 1,
      firstName: "Emma",
      lastName: "Hart",
      email: "emma.hart@sitegate.demo",
      phoneNumber: "07700900001",
      role: "Admin",
      isActive: true,
      createdAt: hoursAgo(240),
    },
    {
      id: 2,
      firstName: "James",
      lastName: "Cole",
      email: "james.cole@sitegate.demo",
      phoneNumber: "07700900002",
      role: "SiteManager",
      isActive: true,
      createdAt: hoursAgo(200),
    },
    {
      id: 3,
      firstName: "Priya",
      lastName: "Shah",
      email: "priya.shah@sitegate.demo",
      phoneNumber: "07700900003",
      role: "Manager",
      isActive: true,
      createdAt: hoursAgo(180),
    },
  ];

  const sites: Site[] = [
    {
      id: 1,
      name: "Riverside Tower",
      address: "42 Harbour Lane, London E14 9GE",
      reference: "REF-RIV-01",
      isActive: true,
    },
    {
      id: 2,
      name: "Oakridge Mixed-Use",
      address: "18 Station Road, Manchester M1 2WE",
      reference: "REF-OAK-02",
      isActive: true,
    },
  ];

  const workAreas: WorkArea[] = [
    {
      id: 1,
      siteId: 1,
      name: "Block A — Superstructure",
      description: "Levels 1–18 frame, cores and plant rooms.",
      isActive: true,
    },
    {
      id: 2,
      siteId: 1,
      name: "Block A — MEP risers",
      description: "Electrical, HVAC and wet risers.",
      isActive: true,
    },
    {
      id: 3,
      siteId: 1,
      name: "Ground floor fit-out",
      description: "Lobby, comms and back-of-house.",
      isActive: true,
    },
    {
      id: 4,
      siteId: 2,
      name: "North wing",
      description: "Plant and service corridors.",
      isActive: true,
    },
  ];

  const rooms: Room[] = [
    {
      id: 1,
      workAreaId: 1,
      roomNumber: "A-101",
      name: "Plant room",
      qrCodeIdentifier: "SG-RIV-A101",
      description: "Primary plant. Isolation required before entry.",
      isActive: true,
    },
    {
      id: 2,
      workAreaId: 2,
      roomNumber: "A-204",
      name: "Electrical riser",
      qrCodeIdentifier: "SG-RIV-A204",
      description: "Live boards. Authorised persons only.",
      isActive: true,
    },
    {
      id: 3,
      workAreaId: 3,
      roomNumber: "GF-12",
      name: "Comms room",
      qrCodeIdentifier: "SG-RIV-GF12",
      description: "Data cabinets and fire alarm panel.",
      isActive: true,
    },
    {
      id: 4,
      workAreaId: 1,
      roomNumber: "A-310",
      name: "Roof access",
      qrCodeIdentifier: "SG-RIV-A310",
      description: "Edge protection must be in place.",
      isActive: true,
    },
    {
      id: 5,
      workAreaId: 4,
      roomNumber: "NW-04",
      name: "Plant corridor",
      qrCodeIdentifier: "SG-OAK-NW04",
      description: "Service spine, north wing.",
      isActive: true,
    },
  ];

  const workers: Worker[] = [
    {
      id: 1,
      firstName: "Tom",
      lastName: "Brennan",
      phoneNumber: "07700900123",
      companyName: "Brennan Electrical",
      isActive: true,
      createdAt: hoursAgo(90),
    },
    {
      id: 2,
      firstName: "Lucy",
      lastName: "Chen",
      phoneNumber: "07700900456",
      companyName: "Apex Scaffolding",
      isActive: true,
      createdAt: hoursAgo(40),
    },
    {
      id: 3,
      firstName: "Marcus",
      lastName: "Reid",
      phoneNumber: "07700900789",
      companyName: "Reid HVAC",
      isActive: true,
      createdAt: hoursAgo(20),
    },
  ];

  const workAreaManagers: WorkAreaManager[] = [
    { id: 1, workAreaId: 1, managerUserId: 2, isPrimary: true },
    { id: 2, workAreaId: 2, managerUserId: 3, isPrimary: true },
    { id: 3, workAreaId: 3, managerUserId: 3, isPrimary: true },
    { id: 4, workAreaId: 4, managerUserId: 2, isPrimary: true },
    { id: 5, workAreaId: 1, managerUserId: 3, isPrimary: false },
  ];

  const windows: AccessWindow[] = [];
  let wid = 1;
  for (const area of workAreas) {
    for (const day of [1, 2, 3, 4, 5]) {
      windows.push({
        id: wid++,
        workAreaId: area.id,
        dayOfWeek: day,
        startTime: "07:00:00",
        endTime: "18:00:00",
        isActive: true,
      });
    }
    windows.push({
      id: wid++,
      workAreaId: area.id,
      dayOfWeek: 6,
      startTime: "08:00:00",
      endTime: "13:00:00",
      isActive: true,
    });
  }

  const requests: AccessRequest[] = [
    {
      id: 1,
      workerId: 1,
      roomId: 3,
      status: "Approved",
      reason: "Second fix",
      workType: "Data / Comms",
      description: "Terminate fibre into cabinet C3. Need 4 hours.",
      phoneNumber: "07700900123",
      approvedAt: hoursAgo(3.2),
      rejectedAt: null,
      clockedInAt: hoursAgo(3),
      expectedClockOutAt: hoursAgo(-5),
      clockedOutAt: null,
      completedAt: null,
      createdAt: hoursAgo(3.5),
    },
    {
      id: 2,
      workerId: 2,
      roomId: 1,
      status: "Pending",
      reason: "First fix",
      workType: "Scaffolding",
      description: "Strike internal scaffold in plant room after steel inspection.",
      phoneNumber: "07700900456",
      approvedAt: null,
      rejectedAt: null,
      clockedInAt: null,
      expectedClockOutAt: null,
      clockedOutAt: null,
      completedAt: null,
      createdAt: hoursAgo(0.6),
    },
    {
      id: 3,
      workerId: 3,
      roomId: 2,
      status: "Pending",
      reason: "Commissioning",
      workType: "HVAC",
      description: "Balance VAV boxes on riser A-204. Isolate AHU-2 first.",
      phoneNumber: "07700900789",
      approvedAt: null,
      rejectedAt: null,
      clockedInAt: null,
      expectedClockOutAt: null,
      clockedOutAt: null,
      completedAt: null,
      createdAt: hoursAgo(0.25),
    },
    {
      id: 4,
      workerId: 1,
      roomId: 2,
      status: "Rejected",
      reason: "Isolation",
      workType: "Electrical",
      description: "Need board isolation for DB-3. Permit not attached.",
      phoneNumber: "07700900123",
      approvedAt: null,
      rejectedAt: hoursAgo(26),
      clockedInAt: null,
      expectedClockOutAt: null,
      clockedOutAt: null,
      completedAt: null,
      createdAt: hoursAgo(28),
    },
    {
      id: 5,
      workerId: 3,
      roomId: 5,
      status: "Completed",
      reason: "Inspection",
      workType: "HVAC",
      description: "Filter change and visual on condensers.",
      phoneNumber: "07700900789",
      approvedAt: hoursAgo(50),
      rejectedAt: null,
      clockedInAt: hoursAgo(49),
      expectedClockOutAt: hoursAgo(41),
      clockedOutAt: hoursAgo(47),
      completedAt: hoursAgo(47),
      createdAt: hoursAgo(52),
    },
  ];

  const approvals: AccessRequestApproval[] = [
    {
      id: 1,
      accessRequestId: 1,
      approverUserId: 3,
      status: "Approved",
      comment: "Comms room free until 16:00. Sign the visitor board.",
      createdAt: hoursAgo(3.2),
    },
    {
      id: 2,
      accessRequestId: 4,
      approverUserId: 3,
      status: "Rejected",
      comment: "No isolation permit attached. Resubmit with RAMS.",
      createdAt: hoursAgo(26),
    },
    {
      id: 3,
      accessRequestId: 5,
      approverUserId: 2,
      status: "Approved",
      comment: "North wing clear.",
      createdAt: hoursAgo(50),
    },
  ];

  const photos: AccessPhoto[] = [
    {
      id: 1,
      accessRequestId: 5,
      storagePath: "",
      originalFileName: "exit-nw04.jpg",
      contentType: "image/jpeg",
      fileSize: 184320,
      uploadedByWorkerId: 3,
      capturedAt: hoursAgo(47),
      photoType: "BeforeExit",
    },
  ];

  const notifications: Notification[] = [
    {
      id: 1,
      userId: 2,
      workerId: null,
      accessRequestId: 2,
      type: "NewRequest",
      channel: "InApp",
      message: "Lucy Chen requested access to A-101 Plant room.",
      status: "Sent",
      sentAt: hoursAgo(0.6),
      readAt: null,
      createdAt: hoursAgo(0.6),
    },
    {
      id: 2,
      userId: 3,
      workerId: null,
      accessRequestId: 3,
      type: "NewRequest",
      channel: "InApp",
      message: "Marcus Reid requested access to A-204 Electrical riser.",
      status: "Sent",
      sentAt: hoursAgo(0.25),
      readAt: null,
      createdAt: hoursAgo(0.25),
    },
    {
      id: 3,
      userId: null,
      workerId: 1,
      accessRequestId: 1,
      type: "Approved",
      channel: "SMS",
      message: "Access approved for GF-12 Comms room. Scan the room QR when you leave.",
      status: "Sent",
      sentAt: hoursAgo(3.2),
      readAt: hoursAgo(3.1),
      createdAt: hoursAgo(3.2),
    },
  ];

  const audits: AuditEvent[] = [
    {
      id: 1,
      accessRequestId: 2,
      workerId: 2,
      userId: null,
      eventType: "AccessRequested",
      description: "Lucy Chen submitted access for A-101 Plant room.",
      ipAddress: "10.4.12.8",
      metadata: JSON.stringify({ room: "A-101", workType: "Scaffolding" }),
      createdAt: hoursAgo(0.6),
    },
    {
      id: 2,
      accessRequestId: 3,
      workerId: 3,
      userId: null,
      eventType: "AccessRequested",
      description: "Marcus Reid submitted access for A-204 Electrical riser.",
      ipAddress: "10.4.12.21",
      metadata: JSON.stringify({ room: "A-204", workType: "HVAC" }),
      createdAt: hoursAgo(0.25),
    },
    {
      id: 3,
      accessRequestId: 1,
      workerId: 1,
      userId: 3,
      eventType: "AccessApproved",
      description: "Priya Shah approved Tom Brennan for GF-12.",
      ipAddress: "10.4.1.4",
      metadata: "{}",
      createdAt: hoursAgo(3.2),
    },
    {
      id: 4,
      accessRequestId: 4,
      workerId: 1,
      userId: 3,
      eventType: "AccessRejected",
      description: "Priya Shah rejected electrical isolation on A-204.",
      ipAddress: "10.4.1.4",
      metadata: "{}",
      createdAt: hoursAgo(26),
    },
    {
      id: 5,
      accessRequestId: 5,
      workerId: 3,
      userId: null,
      eventType: "ClockedOut",
      description: "Marcus Reid clocked out of NW-04.",
      ipAddress: "10.8.0.3",
      metadata: "{}",
      createdAt: hoursAgo(47),
    },
  ];

  return {
    users,
    passwords: {
      "1": "SiteGate1!",
      "2": "SiteGate1!",
      "3": "SiteGate1!",
    },
    sites,
    workAreas,
    rooms,
    workers,
    workAreaManagers,
    windows,
    requests,
    approvals,
    photos,
    otps: [],
    notifications,
    audits,
    sessions: [],
    seq: {
      users: 4,
      sites: 3,
      workAreas: 5,
      rooms: 6,
      workers: 4,
      workAreaManagers: 6,
      windows: wid,
      requests: 6,
      approvals: 4,
      photos: 2,
      otps: 1,
      notifications: 4,
      audits: 6,
    },
  };
}

function emptyDb(): Db {
  return {
    users: [],
    passwords: {},
    sites: [],
    workAreas: [],
    rooms: [],
    workers: [],
    workAreaManagers: [],
    windows: [],
    requests: [],
    approvals: [],
    photos: [],
    otps: [],
    notifications: [],
    audits: [],
    sessions: [],
    seq: {},
  };
}

let memory: Db | null = null;

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function load(): Db {
  if (memory) return memory;
  if (!canUseStorage()) {
    memory = seed();
    return memory;
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      memory = JSON.parse(raw) as Db;
      return memory;
    }
  } catch {
    /* fall through */
  }
  memory = seed();
  persist();
  return memory;
}

function persist() {
  if (!memory || !canUseStorage()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* quota — ignore */
  }
}

function nextId(db: Db, key: string) {
  const n = db.seq[key] ?? 1;
  db.seq[key] = n + 1;
  return n;
}

function token() {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function publicUser(u: User): User {
  return { ...u };
}

function requireSession(body: { token?: string | null }): Session {
  const db = load();
  const tok = body.token?.trim();
  if (!tok) throw new ApiError(401, "Token is required.");
  const session = db.sessions.find((s) => s.token === tok);
  if (!session) throw new ApiError(401, "Invalid or expired token.");
  return session;
}

function requireStaff(body: { token?: string | null }): Session {
  const session = requireSession(body);
  if (session.kind !== "staff") {
    throw new ApiError(403, "Staff access required.");
  }
  return session;
}

function digits(phone: string) {
  return phone.replace(/\D/g, "");
}

function findRoomBundle(qr: string): ScanQrResult {
  const db = load();
  const room = db.rooms.find(
    (r) => r.qrCodeIdentifier.toLowerCase() === qr.trim().toLowerCase() && r.isActive,
  );
  if (!room) throw new ApiError(404, "QR code not recognised.");
  const area = db.workAreas.find((w) => w.id === room.workAreaId);
  const site = area ? db.sites.find((s) => s.id === area.siteId) : undefined;
  return {
    ...room,
    workAreaName: area?.name ?? "Unknown area",
    siteName: site?.name ?? "Unknown site",
    siteId: site?.id ?? 0,
    siteAddress: site?.address ?? "",
  };
}

function notify(partial: Omit<Notification, "id" | "createdAt" | "sentAt" | "readAt" | "status"> & {
  status?: string;
}) {
  const db = load();
  db.notifications.unshift({
    id: nextId(db, "notifications"),
    status: partial.status ?? "Sent",
    sentAt: iso(),
    readAt: null,
    createdAt: iso(),
    ...partial,
  });
}

function audit(partial: Omit<AuditEvent, "id" | "createdAt" | "ipAddress"> & { ipAddress?: string }) {
  const db = load();
  db.audits.unshift({
    id: nextId(db, "audits"),
    createdAt: iso(),
    ipAddress: partial.ipAddress ?? "127.0.0.1",
    ...partial,
  });
}

function managersForWorkArea(workAreaId: number): User[] {
  const db = load();
  const links = db.workAreaManagers.filter((m) => m.workAreaId === workAreaId);
  const ids = new Set(links.map((l) => l.managerUserId));
  const assigned = db.users.filter((u) => ids.has(u.id) && u.isActive);
  const admins = db.users.filter((u) => u.role === "Admin" && u.isActive);
  const map = new Map<number, User>();
  for (const u of [...assigned, ...admins]) map.set(u.id, u);
  return [...map.values()];
}

function expectedOutIso() {
  const d = new Date();
  d.setHours(d.getHours() + 8);
  return d.toISOString();
}

type Body = Record<string, unknown>;

const handlers: Record<string, (body: Body) => unknown> = {
  "/Access/login": (body) => {
    const db = load();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!email || !password) throw new ApiError(400, "Email and password are required.");
    const user = db.users.find((u) => u.email.toLowerCase() === email);
    if (!user || db.passwords[String(user.id)] !== password) {
      throw new ApiError(401, "Incorrect email or password.");
    }
    if (!user.isActive) throw new ApiError(403, "This account is disabled.");
    const session: Session = {
      token: `sgt.${user.id}.${token()}`,
      user: publicUser(user),
      kind: "staff",
    };
    db.sessions.push(session);
    audit({
      accessRequestId: null,
      workerId: null,
      userId: user.id,
      eventType: "Login",
      description: `${user.firstName} ${user.lastName} signed in.`,
      metadata: "{}",
    });
    persist();
    return { token: session.token, user: session.user };
  },

  "/Access/signup": (body) => {
    const db = load();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!email || !password) throw new ApiError(400, "Email and password are required.");
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      throw new ApiError(409, "An account with that email already exists.");
    }
    const user: User = {
      id: nextId(db, "users"),
      firstName: String(body.firstName ?? "").trim() || "New",
      lastName: String(body.lastName ?? "").trim() || "User",
      email,
      phoneNumber: String(body.phoneNumber ?? "").trim(),
      role: String(body.role ?? "Manager"),
      isActive: body.isActive !== false,
      createdAt: iso(),
    };
    db.users.push(user);
    db.passwords[String(user.id)] = password;
    persist();
    return publicUser(user);
  },

  "/Access/scanqr": (body) => {
    const id = String(body.qrCodeIdentifier ?? "").trim();
    if (!id) throw new ApiError(400, "QR code is required.");
    return findRoomBundle(id);
  },

  "/Access/getsites": (body) => {
    requireStaff(body as { token?: string });
    return load().sites;
  },
  "/Access/insertsite": (body) => {
    requireStaff(body as { token?: string });
    const db = load();
    const site: Site = {
      id: nextId(db, "sites"),
      name: String(body.name ?? "Untitled site"),
      address: String(body.address ?? ""),
      reference: String(body.reference ?? ""),
      isActive: true,
    };
    db.sites.push(site);
    persist();
    return site;
  },
  "/Access/updatesite": (body) => {
    requireStaff(body as { token?: string });
    const db = load();
    const site = db.sites.find((s) => s.id === Number(body.id));
    if (!site) throw new ApiError(404, "Site not found.");
    site.name = String(body.name ?? site.name);
    site.address = String(body.address ?? site.address);
    site.reference = String(body.reference ?? site.reference);
    site.isActive = Boolean(body.isActive);
    persist();
    return site;
  },

  "/Access/getworkareas": (body) => {
    requireStaff(body as { token?: string });
    return load().workAreas;
  },
  "/Access/insertworkarea": (body) => {
    requireStaff(body as { token?: string });
    const db = load();
    const area: WorkArea = {
      id: nextId(db, "workAreas"),
      siteId: Number(body.siteId),
      name: String(body.name ?? "Untitled area"),
      description: String(body.description ?? ""),
      isActive: true,
    };
    db.workAreas.push(area);
    persist();
    return area;
  },
  "/Access/updateworkarea": (body) => {
    requireStaff(body as { token?: string });
    const db = load();
    const area = db.workAreas.find((w) => w.id === Number(body.id));
    if (!area) throw new ApiError(404, "Work area not found.");
    area.siteId = Number(body.siteId ?? area.siteId);
    area.name = String(body.name ?? area.name);
    area.description = String(body.description ?? area.description);
    area.isActive = Boolean(body.isActive);
    persist();
    return area;
  },

  "/Access/getusers": (body) => {
    requireSession(body as { token?: string });
    return load().users.map(publicUser);
  },
  "/Access/getmanagersforroom": (body) => {
    const room = load().rooms.find((r) => r.id === Number(body.roomId ?? body.RoomId));
    if (!room) return [];
    const departmentId = Number(body.departmentId ?? body.DepartmentId ?? 0);
    return managersForWorkArea(room.workAreaId)
      .filter(() => !departmentId || departmentId === room.workAreaId)
      .map((u) => ({
        ...publicUser(u),
        departmentName: load().workAreas.find((a) => a.id === room.workAreaId)?.name,
        departmentId: room.workAreaId,
      }));
  },
  "/Access/getdepartmentsforroom": (body) => {
    const room = load().rooms.find((r) => r.id === Number(body.roomId ?? body.RoomId));
    if (!room) return [];
    const area = load().workAreas.find((a) => a.id === room.workAreaId);
    if (!area) return [];
    return [
      {
        id: area.id,
        siteId: area.siteId,
        name: area.name,
        description: area.description,
        isActive: area.isActive,
      },
    ];
  },
  "/Access/insertuser": (body) => {
    requireStaff(body as { token?: string });
    const db = load();
    const email = String(body.email ?? "").trim().toLowerCase();
    const user: User = {
      id: nextId(db, "users"),
      firstName: String(body.firstName ?? ""),
      lastName: String(body.lastName ?? ""),
      email,
      phoneNumber: String(body.phoneNumber ?? ""),
      role: String(body.role ?? "Manager"),
      isActive: true,
      createdAt: iso(),
    };
    db.users.push(user);
    db.passwords[String(user.id)] = "SiteGate1!";
    persist();
    return publicUser(user);
  },
  "/Access/updateuser": (body) => {
    requireStaff(body as { token?: string });
    const db = load();
    const user = db.users.find((u) => u.id === Number(body.id));
    if (!user) throw new ApiError(404, "User not found.");
    user.firstName = String(body.firstName ?? user.firstName);
    user.lastName = String(body.lastName ?? user.lastName);
    user.email = String(body.email ?? user.email);
    user.phoneNumber = String(body.phoneNumber ?? user.phoneNumber);
    user.role = String(body.role ?? user.role);
    user.isActive = Boolean(body.isActive);
    persist();
    return publicUser(user);
  },

  "/Access/getworkareamanagers": (body) => {
    requireStaff(body as { token?: string });
    return load().workAreaManagers;
  },
  "/Access/insertworkareamanager": (body) => {
    requireStaff(body as { token?: string });
    const db = load();
    const row: WorkAreaManager = {
      id: nextId(db, "workAreaManagers"),
      workAreaId: Number(body.workAreaId),
      managerUserId: Number(body.managerUserId),
      isPrimary: Boolean(body.isPrimary),
    };
    db.workAreaManagers.push(row);
    persist();
    return row;
  },
  "/Access/updateworkareamanager": (body) => {
    requireStaff(body as { token?: string });
    const db = load();
    const row = db.workAreaManagers.find((m) => m.id === Number(body.id));
    if (!row) throw new ApiError(404, "Assignment not found.");
    row.workAreaId = Number(body.workAreaId ?? row.workAreaId);
    row.managerUserId = Number(body.managerUserId ?? row.managerUserId);
    row.isPrimary = Boolean(body.isPrimary);
    persist();
    return row;
  },

  "/Access/getworkers": (body) => {
    requireStaff(body as { token?: string });
    return load().workers;
  },
  "/Access/insertworker": (body) => {
    const db = load();
    const phone = digits(String(body.phoneNumber ?? ""));
    if (!phone) throw new ApiError(400, "Phone number is required.");
    const existing = db.workers.find((w) => digits(w.phoneNumber) === phone);
    if (existing) {
      if (body.firstName) existing.firstName = String(body.firstName);
      if (body.lastName) existing.lastName = String(body.lastName);
      if (body.companyName) existing.companyName = String(body.companyName);
      for (const s of db.sessions) {
        if (s.kind === "worker" && s.phoneNumber && digits(s.phoneNumber) === phone) {
          s.workerId = existing.id;
        }
      }
      persist();
      return existing;
    }
    const worker: Worker = {
      id: nextId(db, "workers"),
      firstName: String(body.firstName ?? "Worker"),
      lastName: String(body.lastName ?? ""),
      phoneNumber: phone,
      companyName: String(body.companyName ?? ""),
      isActive: true,
      createdAt: iso(),
    };
    db.workers.push(worker);
    for (const s of db.sessions) {
      if (s.kind === "worker" && s.phoneNumber && digits(s.phoneNumber) === phone) {
        s.workerId = worker.id;
      }
    }
    persist();
    return worker;
  },
  "/Access/updateworker": (body) => {
    requireStaff(body as { token?: string });
    const db = load();
    const worker = db.workers.find((w) => w.id === Number(body.id));
    if (!worker) throw new ApiError(404, "Worker not found.");
    worker.firstName = String(body.firstName ?? worker.firstName);
    worker.lastName = String(body.lastName ?? worker.lastName);
    worker.phoneNumber = String(body.phoneNumber ?? worker.phoneNumber);
    worker.companyName = String(body.companyName ?? worker.companyName);
    worker.isActive = Boolean(body.isActive);
    persist();
    return worker;
  },

  "/Access/getrooms": (body) => {
    requireStaff(body as { token?: string });
    return load().rooms;
  },
  "/Access/insertroom": (body) => {
    requireStaff(body as { token?: string });
    const db = load();
    const room: Room = {
      id: nextId(db, "rooms"),
      workAreaId: Number(body.workAreaId),
      roomNumber: String(body.roomNumber ?? ""),
      name: String(body.name ?? "Room"),
      qrCodeIdentifier: `SG-${token().slice(0, 8).toUpperCase()}`,
      description: String(body.description ?? ""),
      isActive: true,
    };
    db.rooms.push(room);
    persist();
    return room;
  },
  "/Access/updateroom": (body) => {
    requireStaff(body as { token?: string });
    const db = load();
    const room = db.rooms.find((r) => r.id === Number(body.id));
    if (!room) throw new ApiError(404, "Room not found.");
    room.workAreaId = Number(body.workAreaId ?? room.workAreaId);
    room.roomNumber = String(body.roomNumber ?? room.roomNumber);
    room.name = String(body.name ?? room.name);
    room.qrCodeIdentifier = String(body.qrCodeIdentifier ?? room.qrCodeIdentifier);
    room.description = String(body.description ?? room.description);
    room.isActive = Boolean(body.isActive);
    persist();
    return room;
  },

  "/Access/getaccesswindows": (body) => {
    requireStaff(body as { token?: string });
    return load().windows;
  },
  "/Access/insertaccesswindow": (body) => {
    requireStaff(body as { token?: string });
    const db = load();
    const row: AccessWindow = {
      id: nextId(db, "windows"),
      workAreaId: Number(body.workAreaId),
      dayOfWeek: Number(body.dayOfWeek),
      startTime: String(body.startTime ?? "07:00:00"),
      endTime: String(body.endTime ?? "18:00:00"),
      isActive: true,
    };
    db.windows.push(row);
    persist();
    return row;
  },
  "/Access/updateaccesswindow": (body) => {
    requireStaff(body as { token?: string });
    const db = load();
    const row = db.windows.find((w) => w.id === Number(body.id));
    if (!row) throw new ApiError(404, "Window not found.");
    row.workAreaId = Number(body.workAreaId ?? row.workAreaId);
    row.dayOfWeek = Number(body.dayOfWeek ?? row.dayOfWeek);
    row.startTime = String(body.startTime ?? row.startTime);
    row.endTime = String(body.endTime ?? row.endTime);
    row.isActive = Boolean(body.isActive);
    persist();
    return row;
  },

  "/Access/getaccessrequests": (body) => {
    const session = requireSession(body as { token?: string });
    const db = load();
    let rows = db.requests;
    if (session.kind === "worker") {
      const phone = session.phoneNumber ? digits(session.phoneNumber) : "";
      rows = db.requests.filter(
        (r) =>
          (session.workerId != null && r.workerId === session.workerId) ||
          (phone && digits(r.phoneNumber ?? "") === phone),
      );
    }
    const id = Number(body.id ?? body.Id ?? 0);
    const workerId = Number(body.workerId ?? body.WorkerId ?? 0);
    const roomId = Number(body.roomId ?? body.RoomId ?? 0);
    const status = String(body.status ?? body.Status ?? "");
    const search = String(body.search ?? body.Search ?? "").toLowerCase();
    const skip = Number(body.skip ?? body.Skip ?? 0);
    const take = Number(body.take ?? body.Take ?? 0);
    if (id) rows = rows.filter((r) => r.id === id);
    if (workerId) rows = rows.filter((r) => r.workerId === workerId);
    if (roomId) rows = rows.filter((r) => r.roomId === roomId);
    if (status) rows = rows.filter((r) => r.status === status);
    if (search) {
      rows = rows.filter((r) =>
        `${r.workType} ${r.reason} ${r.description}`.toLowerCase().includes(search),
      );
    }
    const total = rows.length;
    const sliced = take > 0 ? rows.slice(skip, skip + take) : rows.slice(skip);
    return sliced.map((r) => ({ ...r, total }));
  },
  "/Access/insertaccessrequest": (body) => {
    const db = load();
    const phone = digits(String(body.phoneNumber ?? ""));
    let worker = db.workers.find((w) => w.id === Number(body.workerId));
    if (!worker && phone) worker = db.workers.find((w) => digits(w.phoneNumber) === phone);
    if (!worker) throw new ApiError(400, "Worker not found. Register first.");
    const room = db.rooms.find((r) => r.id === Number(body.roomId));
    if (!room) throw new ApiError(404, "Room not found.");

    const active = db.requests.find(
      (r) =>
        r.workerId === worker.id &&
        r.roomId === room.id &&
        (r.status === "Pending" || r.status === "Approved"),
    );
    if (active) return active;

    const req: AccessRequest = {
      id: nextId(db, "requests"),
      workerId: worker.id,
      roomId: room.id,
      status: "Pending",
      reason: String(body.reason ?? ""),
      workType: String(body.workType ?? ""),
      description: String(body.description ?? ""),
      phoneNumber: phone || worker.phoneNumber,
      approvedAt: null,
      rejectedAt: null,
      clockedInAt: null,
      expectedClockOutAt: null,
      clockedOutAt: null,
      completedAt: null,
      createdAt: iso(),
    };
    db.requests.unshift(req);
    const area = db.workAreas.find((w) => w.id === room.workAreaId);
    const chosenId = Number(body.approverUserId);
    const assigned =
      (chosenId ? db.users.find((u) => u.id === chosenId) : undefined) ??
      managersForWorkArea(room.workAreaId)[0];
    if (assigned) {
      db.approvals.unshift({
        id: nextId(db, "approvals"),
        accessRequestId: req.id,
        approverUserId: assigned.id,
        status: "Pending",
        comment: "",
        createdAt: iso(),
        reviewedAt: null,
      });
      notify({
        userId: assigned.id,
        workerId: worker.id,
        accessRequestId: req.id,
        type: "NewRequest",
        channel: "InApp",
        message: `${worker.firstName} ${worker.lastName} requested access to ${room.roomNumber} ${room.name}.`,
      });
    }
    audit({
      accessRequestId: req.id,
      workerId: worker.id,
      userId: null,
      eventType: "AccessRequested",
      description: `${worker.firstName} ${worker.lastName} submitted access for ${room.roomNumber}.`,
      metadata: JSON.stringify({
        room: room.roomNumber,
        workType: req.workType,
        area: area?.name,
      }),
    });
    persist();
    return req;
  },
  "/Access/updateaccessrequest": (body) => {
    const session = requireSession(body as { token?: string });
    const db = load();
    const req = db.requests.find((r) => r.id === Number(body.id));
    if (!req) throw new ApiError(404, "Request not found.");
    if (session.kind === "worker" && req.workerId !== session.workerId) {
      throw new ApiError(403, "You can only update your own request.");
    }
    if (body.workerId != null) req.workerId = Number(body.workerId);
    if (body.roomId != null) req.roomId = Number(body.roomId);
    if (body.status != null) req.status = String(body.status);
    if (body.reason != null) req.reason = String(body.reason);
    if (body.workType != null) req.workType = String(body.workType);
    if (body.description != null) req.description = String(body.description);
    if ("approvedAt" in body) req.approvedAt = (body.approvedAt as string) || null;
    if ("rejectedAt" in body) req.rejectedAt = (body.rejectedAt as string) || null;
    if ("clockedInAt" in body) req.clockedInAt = (body.clockedInAt as string) || null;
    if ("expectedClockOutAt" in body) {
      req.expectedClockOutAt = (body.expectedClockOutAt as string) || null;
    }
    if ("clockedOutAt" in body) req.clockedOutAt = (body.clockedOutAt as string) || null;
    if ("completedAt" in body) req.completedAt = (body.completedAt as string) || null;
    persist();
    return req;
  },

  "/Access/getaccessrequestapprovals": (body) => {
    requireStaff(body as { token?: string });
    const db = load();
    const id = Number(body.id ?? body.Id ?? 0);
    const accessRequestId = Number(body.accessRequestId ?? body.AccessRequestId ?? 0);
    const approverUserId = Number(body.approverUserId ?? body.ApproverUserId ?? 0);
    const status = String(body.status ?? body.Status ?? "");
    const search = String(body.search ?? body.Search ?? "").toLowerCase();
    const skip = Number(body.skip ?? body.Skip ?? 0);
    const take = Number(body.take ?? body.Take ?? 0);
    let rows = db.approvals
      .map((a) => {
        const req = db.requests.find((r) => r.id === a.accessRequestId);
        const worker = req ? db.workers.find((w) => w.id === req.workerId) : undefined;
        const approver = db.users.find((u) => u.id === a.approverUserId);
        return {
          ...a,
          reviewedAt: a.reviewedAt ?? a.createdAt,
          approverFirstName: approver?.firstName ?? "",
          approverLastName: approver?.lastName ?? "",
          approverEmail: approver?.email ?? "",
          workerFirstName: worker?.firstName ?? "",
          workerLastName: worker?.lastName ?? "",
          workerPhoneNumber: worker?.phoneNumber ?? "",
        };
      })
      .sort((a, b) => String(b.reviewedAt || b.createdAt).localeCompare(String(a.reviewedAt || a.createdAt)));
    if (id) rows = rows.filter((a) => a.id === id);
    if (accessRequestId) rows = rows.filter((a) => a.accessRequestId === accessRequestId);
    if (approverUserId) rows = rows.filter((a) => a.approverUserId === approverUserId);
    if (status) rows = rows.filter((a) => a.status === status);
    if (search) {
      rows = rows.filter((a) =>
        `${a.workerFirstName} ${a.workerLastName} ${a.approverFirstName} ${a.approverLastName}`
          .toLowerCase()
          .includes(search),
      );
    }
    const total = rows.length;
    const sliced = take > 0 ? rows.slice(skip, skip + take) : rows.slice(skip);
    return sliced.map((a) => ({ ...a, total }));
  },
  "/Access/insertaccessrequestapproval": (body) => {
    const session = requireSession(body as { token?: string });
    const db = load();
    const req = db.requests.find((r) => r.id === Number(body.accessRequestId));
    if (!req) throw new ApiError(404, "Request not found.");
    const status = String(body.status ?? "Pending");
    const approverUserId = Number(body.approverUserId ?? session.user.id);
    const existing = db.approvals.find(
      (a) => a.accessRequestId === req.id && a.approverUserId === approverUserId,
    );
    if (existing && /^pending$/i.test(String(existing.status)) && /^pending$/i.test(status)) {
      return existing;
    }
    const row: AccessRequestApproval = {
      id: nextId(db, "approvals"),
      accessRequestId: req.id,
      approverUserId,
      status,
      comment: String(body.comment ?? ""),
      createdAt: iso(),
      reviewedAt: /^pending$/i.test(status) ? null : iso(),
    };
    db.approvals.unshift(row);
    const worker = db.workers.find((w) => w.id === req.workerId);
    const room = db.rooms.find((r) => r.id === req.roomId);
    if (status === "Approved") {
      req.status = "Approved";
      req.approvedAt = iso();
      req.clockedInAt = iso();
      req.expectedClockOutAt = expectedOutIso();
      notify({
        userId: null,
        workerId: req.workerId,
        accessRequestId: req.id,
        type: "Approved",
        channel: "SMS",
        message: `Access approved for ${room?.roomNumber ?? "room"}. Scan the same QR when you leave.`,
      });
      audit({
        accessRequestId: req.id,
        workerId: req.workerId,
        userId: session.user.id,
        eventType: "AccessApproved",
        description: `${session.user.firstName} ${session.user.lastName} approved ${worker?.firstName ?? "worker"} for ${room?.roomNumber ?? "room"}.`,
        metadata: JSON.stringify({ comment: row.comment }),
      });
    } else if (status === "Rejected") {
      req.status = "Rejected";
      req.rejectedAt = iso();
      notify({
        userId: null,
        workerId: req.workerId,
        accessRequestId: req.id,
        type: "Rejected",
        channel: "SMS",
        message: `Access declined for ${room?.roomNumber ?? "room"}. ${row.comment || "Contact the site manager."}`,
      });
      audit({
        accessRequestId: req.id,
        workerId: req.workerId,
        userId: session.user.id,
        eventType: "AccessRejected",
        description: `${session.user.firstName} ${session.user.lastName} rejected ${worker?.firstName ?? "worker"} for ${room?.roomNumber ?? "room"}.`,
        metadata: JSON.stringify({ comment: row.comment }),
      });
    }
    persist();
    return row;
  },
  "/Access/updateaccessrequestapproval": (body) => {
    requireStaff(body as { token?: string });
    const db = load();
    const row =
      db.approvals.find((a) => a.id && a.id === Number(body.id)) ||
      db.approvals.find(
        (a) =>
          a.accessRequestId === Number(body.accessRequestId) &&
          a.approverUserId === Number(body.approverUserId),
      ) ||
      db.approvals.find((a) => a.accessRequestId === Number(body.accessRequestId));
    if (!row) throw new ApiError(404, "Approval not found.");
    row.status = String(body.status ?? row.status);
    if ("comment" in body) row.comment = String(body.comment ?? "");
    row.reviewedAt =
      body.reviewedAt != null && String(body.reviewedAt) ? String(body.reviewedAt) : iso();
    const req = db.requests.find((r) => r.id === row.accessRequestId);
    if (req) {
      const status = String(row.status);
      if (status === "Approved") {
        req.status = "Approved";
        req.approvedAt = row.reviewedAt ?? iso();
        req.clockedInAt = req.clockedInAt ?? iso();
      } else if (status === "Rejected") {
        req.status = "Rejected";
        req.rejectedAt = row.reviewedAt ?? iso();
      } else if (status === "Cancelled") {
        req.status = "Cancelled";
      }
    }
    persist();
    return row;
  },

  "/Access/getaccessphotos": (body) => {
    requireSession(body as { token?: string });
    return load().photos;
  },
  "/Access/insertaccessphoto": (body) => {
    const session = requireSession(body as { token?: string });
    const db = load();
    const photo: AccessPhoto = {
      id: nextId(db, "photos"),
      accessRequestId: Number(body.accessRequestId),
      storagePath: String(body.storagePath ?? ""),
      originalFileName: String(body.originalFileName ?? "photo.jpg"),
      contentType: String(body.contentType ?? "image/jpeg"),
      fileSize: Number(body.fileSize ?? 0),
      uploadedByWorkerId: Number(
        body.uploadedByWorkerId ?? session.workerId ?? 0,
      ),
      capturedAt: String(body.capturedAt ?? iso()),
      photoType: String(body.photoType ?? "BeforeExit"),
    };
    db.photos.unshift(photo);
    persist();
    return photo;
  },
  "/Access/updateaccessphoto": (body) => {
    requireStaff(body as { token?: string });
    const db = load();
    const photo = db.photos.find((p) => p.id === Number(body.id));
    if (!photo) throw new ApiError(404, "Photo not found.");
    photo.accessRequestId = Number(body.accessRequestId ?? photo.accessRequestId);
    photo.storagePath = String(body.storagePath ?? photo.storagePath);
    photo.originalFileName = String(body.originalFileName ?? photo.originalFileName);
    photo.contentType = String(body.contentType ?? photo.contentType);
    photo.fileSize = Number(body.fileSize ?? photo.fileSize);
    photo.uploadedByWorkerId = Number(body.uploadedByWorkerId ?? photo.uploadedByWorkerId);
    photo.capturedAt = String(body.capturedAt ?? photo.capturedAt);
    photo.photoType = String(body.photoType ?? photo.photoType);
    persist();
    return photo;
  },

  "/Access/getotpverifications": (body) => {
    requireStaff(body as { token?: string });
    return load().otps.map((o) => ({ ...o, codeHash: "••••••" }));
  },
  "/Access/insertotpverification": (body) => {
    const db = load();
    const phone = digits(String(body.phoneNumber ?? ""));
    if (!phone) throw new ApiError(400, "Phone number is required.");
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const worker = db.workers.find((w) => digits(w.phoneNumber) === phone);
    const row: OTPVerification = {
      id: nextId(db, "otps"),
      workerId: worker?.id ?? null,
      phoneNumber: phone,
      codeHash: code,
      expiresAt: String(body.expiresAt ?? iso(10 * 60_000)),
      verifiedAt: null,
      attemptCount: 0,
    };
    db.otps.unshift(row);
    persist();
    // Demo returns the code so the UI can show an SMS preview.
    return { ...row, code };
  },
  "/Access/verifyotp": (body) => {
    const db = load();
    const code = String(body.code ?? "");
    const row = db.otps.find(
      (o) => !o.verifiedAt && o.codeHash === code && new Date(o.expiresAt).getTime() > Date.now(),
    );
    if (!row) {
      const latest = db.otps.find((o) => !o.verifiedAt);
      if (latest) {
        latest.attemptCount += 1;
        persist();
      }
      throw new ApiError(401, "That code is not valid or has expired.");
    }
    row.verifiedAt = iso();
    let worker = db.workers.find((w) => digits(w.phoneNumber) === digits(row.phoneNumber));
    if (!worker && row.workerId) worker = db.workers.find((w) => w.id === row.workerId);
    const session: Session = {
      token: `wgt.${row.id}.${token()}`,
      user: {
        id: worker?.id ?? 0,
        firstName: worker?.firstName ?? "Worker",
        lastName: worker?.lastName ?? "",
        email: "",
        phoneNumber: row.phoneNumber,
        role: "Worker",
        isActive: true,
        createdAt: iso(),
      },
      workerId: worker?.id,
      phoneNumber: row.phoneNumber,
      kind: "worker",
    };
    db.sessions.push(session);
    persist();
    return { verified: true, token: session.token, worker: worker ?? null, phoneNumber: row.phoneNumber };
  },
  "/Access/updateotpverification": (body) => {
    requireStaff(body as { token?: string });
    const db = load();
    const row = db.otps.find((o) => o.id === Number(body.id));
    if (!row) throw new ApiError(404, "OTP record not found.");
    row.workerId = Number(body.workerId ?? row.workerId);
    row.phoneNumber = String(body.phoneNumber ?? row.phoneNumber);
    row.codeHash = String(body.codeHash ?? row.codeHash);
    row.expiresAt = String(body.expiresAt ?? row.expiresAt);
    if ("verifiedAt" in body) row.verifiedAt = (body.verifiedAt as string) || null;
    row.attemptCount = Number(body.attemptCount ?? row.attemptCount);
    persist();
    return row;
  },

  "/Access/getnotifications": (body) => {
    const session = requireSession(body as { token?: string });
    const db = load();
    if (session.kind === "worker") {
      return db.notifications.filter((n) => n.workerId === session.workerId);
    }
    return db.notifications.filter((n) => n.userId === session.user.id);
  },
  "/Access/insertnotification": (body) => {
    requireStaff(body as { token?: string });
    const db = load();
    const row: Notification = {
      id: nextId(db, "notifications"),
      userId: body.userId == null ? null : Number(body.userId),
      workerId: body.workerId == null ? null : Number(body.workerId),
      accessRequestId: body.accessRequestId == null ? null : Number(body.accessRequestId),
      type: String(body.type ?? "Info"),
      channel: String(body.channel ?? "InApp"),
      message: String(body.message ?? ""),
      status: "Sent",
      sentAt: iso(),
      readAt: null,
      createdAt: iso(),
    };
    db.notifications.unshift(row);
    persist();
    return row;
  },
  "/Access/updatenotification": (body) => {
    requireSession(body as { token?: string });
    const db = load();
    const row = db.notifications.find((n) => n.id === Number(body.id));
    if (!row) throw new ApiError(404, "Notification not found.");
    if (body.status != null) row.status = String(body.status);
    if ("readAt" in body) row.readAt = (body.readAt as string) || null;
    if (body.message != null) row.message = String(body.message);
    persist();
    return row;
  },

  "/Access/getauditevents": (body) => {
    requireStaff(body as { token?: string });
    return load().audits;
  },
  "/Access/insertauditevent": (body) => {
    const session = requireSession(body as { token?: string });
    const db = load();
    const row: AuditEvent = {
      id: nextId(db, "audits"),
      accessRequestId: body.accessRequestId == null ? null : Number(body.accessRequestId),
      workerId: body.workerId == null ? null : Number(body.workerId),
      userId: body.userId == null ? session.user.id : Number(body.userId),
      eventType: String(body.eventType ?? "Note"),
      description: String(body.description ?? ""),
      ipAddress: String(body.ipAddress ?? "127.0.0.1"),
      metadata: String(body.metadata ?? "{}"),
      createdAt: iso(),
    };
    db.audits.unshift(row);
    persist();
    return row;
  },
};

export function resetDemoData() {
  memory = seed();
  persist();
}

export function getDb(): Db {
  return load();
}

export function mockHandle(path: string, body: unknown) {
  const fn = handlers[path];
  if (!fn) throw new ApiError(404, `Unknown endpoint ${path}`);
  return fn((body ?? {}) as Body);
}
