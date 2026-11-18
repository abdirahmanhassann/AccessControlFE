export type Role = "Admin" | "SiteManager" | "Manager" | "Keyman" | "Viewer";

export type RequestStatus =
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Completed"
  | "Cancelled";

export type ApprovalStatus = "Approved" | "Rejected" | "Pending";

export type NotificationStatus = "Queued" | "Sent" | "Read" | "Failed";

export type LocationKind = "Apartment" | "Riser";

export type User = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: Role | string;
  isActive: boolean;
  createdAt: string;
  departmentId?: number;
  departmentName?: string;
};

export type Site = {
  id: number;
  name: string;
  address: string;
  reference: string;
  isActive: boolean;
  qrCodeIdentifier?: string;
};

export type WorkArea = {
  id: number;
  siteId: number;
  name: string;
  description: string;
  isActive: boolean;
  siteName?: string;
};

export type Room = {
  id: number;
  workAreaId: number;
  roomNumber: string;
  name: string;
  qrCodeIdentifier: string;
  description: string;
  isActive: boolean;
  locationKind?: LocationKind | string;
};

export type Worker = {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  companyName: string;
  isActive: boolean;
  createdAt: string;
  /** Set when the worker is blocked from requesting access; null when they are not. */
  blockedAt?: string | null;
  blockedReason?: string | null;
  /** Open strikes behind a block, from the API. */
  overdueCount?: number;
  photoRejectedCount?: number;
};

/** The auto-block thresholds. 0 turns a rule off. */
export type AppSettings = {
  autoBlockOverdueCount: number;
  autoBlockPhotoRejectedCount: number;
};

export type WorkAreaManager = {
  id: number;
  workAreaId: number;
  managerUserId: number;
  isPrimary: boolean;
};

export type RoomManager = {
  id: number;
  roomId: number;
  managerUserId: number;
  isPrimary: boolean;
};

export type Department = {
  id: number;
  siteId: number;
  name: string;
  description: string;
  isActive: boolean;
  siteName?: string;
};

export type DepartmentRoomMapping = {
  id: number;
  departmentId: number;
  roomId: number;
  departmentName?: string;
  roomNumber?: string;
  roomName?: string;
};

export type DepartmentManagerMapping = {
  id: number;
  departmentId: number;
  userId: number;
  isPrimary: boolean;
  departmentName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
};

export type WorkerSiteMapping = {
  id: number;
  workerId: number;
  siteId: number;
  workerFirstName?: string;
  workerLastName?: string;
  siteName?: string;
};

export type AccessWindow = {
  id: number;
  workAreaId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
};

export type AccessRequest = {
  id: number;
  workerId: number;
  roomId: number;
  status: RequestStatus | string;
  reason: string;
  workType: string;
  description: string;
  phoneNumber?: string;
  supervisorName?: string;
  workFrom?: string | null;
  workTo?: string | null;
  towerName?: string;
  locationLabel?: string;
  roomNumber?: string;
  roomName?: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  clockedInAt: string | null;
  expectedClockOutAt: string | null;
  clockedOutAt: string | null;
  completedAt: string | null;
  createdAt: string;
  workerFirstName?: string;
  workerLastName?: string;
  workerPhoneNumber?: string;
};

export type AccessRequestApproval = {
  id: number;
  accessRequestId: number;
  approverUserId: number;
  status: ApprovalStatus | string;
  comment: string;
  createdAt: string;
  reviewedAt?: string | null;
  approverFirstName?: string;
  approverLastName?: string;
  approverEmail?: string;
  workerFirstName?: string;
  workerLastName?: string;
  workerPhoneNumber?: string;
};

export type AccessPhoto = {
  id: number;
  accessRequestId: number;
  storagePath: string;
  originalFileName: string;
  contentType: string;
  fileSize: number;
  uploadedByWorkerId: number;
  capturedAt: string;
  photoType: string;
};

/**
 * The Keyman's check of a room after the worker signed out of it.
 * One per access request; opened by the API when the visit is clocked out.
 */
export type RoomLeaveStatus = "Pending" | "Approved" | "Rejected";

export type RoomLeaveReview = {
  id: number;
  accessRequestId: number;
  status: RoomLeaveStatus | string;
  reason: string;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedByUserId: number | null;
  reviewerFirstName?: string;
  reviewerLastName?: string;
  workerId: number;
  workerFirstName?: string;
  workerLastName?: string;
  workerPhoneNumber?: string;
  companyName?: string;
  roomId: number;
  roomNumber?: string;
  roomName?: string;
  workAreaName?: string;
  siteName?: string;
  workType?: string;
  workFrom?: string | null;
  workTo?: string | null;
  clockedInAt?: string | null;
  clockedOutAt?: string | null;
  photoCount: number;
};

export type OTPVerification = {
  id: number;
  workerId: number | null;
  phoneNumber: string;
  codeHash: string;
  expiresAt: string;
  verifiedAt: string | null;
  attemptCount: number;
};

export type Notification = {
  id: number;
  userId: number | null;
  workerId: number | null;
  accessRequestId: number | null;
  type: string;
  channel: string;
  message: string;
  status: NotificationStatus | string;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
};

export type AuditEvent = {
  id: number;
  accessRequestId: number | null;
  workerId: number | null;
  userId: number | null;
  eventType: string;
  description: string;
  ipAddress: string;
  metadata: string;
  createdAt: string;
};

export type ScanQrResult = Room & {
  workAreaName: string;
  siteName: string;
  siteId: number;
  siteAddress: string;
  scanKind?: "site" | "room";
};

export type Session = {
  token: string;
  user: User;
  workerId?: number;
  phoneNumber?: string;
  kind: "staff" | "worker";
};

export type LoginRequest = {
  email: string;
  password: string;
  twoFactorCode?: string | null;
  twoFactorRecoveryCode?: string | null;
};

export type CreateUserRequest = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  password?: string | null;
  role?: string | null;
  isActive?: boolean;
  token?: string | null;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const WORK_TYPES = [
  "Electrical",
  "Mechanical",
  "HVAC",
  "Scaffolding",
  "Structural",
  "Plumbing",
  "Commissioning",
  "Inspection",
  "Data / Comms",
  "Delivery",
  "General",
];

export const PHOTO_TYPES = ["BeforeExit", "Condition", "Isolation", "Other"];
