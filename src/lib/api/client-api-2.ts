import { ApiError } from "./types";
import {
  asArray,
  isPlainObject,
  num,
  pickNum,
  pickStr,
  post,
  postForm,
} from "./client-http";
import {
  asApproval,
  asAudit,
  asWorkerRow,
  coerceRow,
} from "./client-mappers";
import {
  asPagedList,
  dual,
  listFilterBody,
} from "./client-list";
import type { ListFilter } from "./client-list";
import type {
  AccessPhoto,
  AccessRequest,
  AccessRequestApproval,
  AuditEvent,
  Notification,
  OTPVerification,
} from "./types";

export type InsertPhotoInput = {
  accessRequestId: number;
  photoType: string;
  uploadedByWorkerId: number;
  /** JPEG/PNG blob or File from camera / file input */
  file?: Blob | File;
  /** data:image/... URL from CameraCapture — converted to a blob */
  dataUrl?: string;
  fileName?: string;
};

async function toUploadFile(data: InsertPhotoInput): Promise<{ blob: Blob; fileName: string }> {
  if (data.file) {
    const fileName =
      data.fileName ||
      (data.file instanceof File ? data.file.name : "photo.jpg") ||
      "photo.jpg";
    return { blob: data.file, fileName };
  }
  if (data.dataUrl) {
    const res = await fetch(data.dataUrl);
    const blob = await res.blob();
    return { blob, fileName: data.fileName || "photo.jpg" };
  }
  throw new ApiError(400, "No photo file provided.");
}

export const apiPart2 = {
  updateAccessRequest: (token: string | undefined, data: Partial<AccessRequest> & { id: number }) => {
    const payload: Record<string, unknown> = { ...data };
    if (token) payload.token = token;
    return post<AccessRequest | null>("/Access/updateaccessrequest", dual(payload));
  },

  getApprovals: async (token: string, filter?: ListFilter) =>
    asPagedList(
      await post("/Access/getaccessrequestapprovals", listFilterBody(token, filter)),
      (row) => asApproval(row),
      (row) => Boolean(row.id || row.accessRequestId),
    ),
  insertApproval: (
    token: string,
    data: { accessRequestId: number; approverUserId: number; status: string; comment: string },
  ) =>
    post<AccessRequestApproval | null>(
      "/Access/insertaccessrequestapproval",
      dual({
        token,
        accessRequestId: data.accessRequestId,
        approverUserId: data.approverUserId,
        status: data.status,
        comment: data.comment ?? "",
      }),
    ),
  updateApproval: (
    token: string,
    data: {
      id: number;
      accessRequestId: number;
      status: string;
      comment?: string | null;
      reviewedAt?: string | null;
      approverUserId?: number;
      workerId?: number;
      roomId?: number;
      reason?: string | null;
      workType?: string | null;
      description?: string | null;
    },
  ) => {
    const accessRequestApprovalId = num(data.id);
    const accessRequestId = num(data.accessRequestId);
    if (!accessRequestApprovalId) {
      throw new ApiError(400, "AccessRequestApprovalId is required.");
    }
    if (!accessRequestId) {
      throw new ApiError(400, "AccessRequestId is required.");
    }
    const reviewedAt = data.reviewedAt ?? new Date().toISOString().slice(0, 19);
    const approved = /^approved$/i.test(data.status);
    const rejected = /^rejected$/i.test(data.status);
    const payload: Record<string, unknown> = {
      token,
      id: accessRequestApprovalId,
      accessRequestApprovalId,
      accessRequestId,
      status: data.status,
      comment: data.comment ?? "",
      reviewedAt,
      reason: data.reason ?? data.comment ?? "",
      workType: data.workType ?? "",
      description: data.description ?? "",
      approvedAt: approved ? reviewedAt : null,
      rejectedAt: rejected ? reviewedAt : null,
    };
    const approverUserId = num(data.approverUserId);
    const workerId = num(data.workerId);
    const roomId = num(data.roomId);
    if (approverUserId) payload.approverUserId = approverUserId;
    if (workerId) payload.workerId = workerId;
    if (roomId) payload.roomId = roomId;
    return post<AccessRequestApproval | null>("/Access/updateaccessrequestapproval", dual(payload));
  },

  getPhotos: (token: string) =>
    post<AccessPhoto[]>("/Access/getaccessphotos", { token }).then(asArray<AccessPhoto>),

  /**
   * Multipart upload matching BE InsertAccessPhoto([FromForm] ...).
   * Returns storagePath string from the API Data field.
   */
  insertPhoto: async (token: string, data: InsertPhotoInput): Promise<string> => {
    const { blob, fileName } = await toUploadFile(data);
    const form = new FormData();
    form.append("Token", token);
    form.append("AccessRequestId", String(data.accessRequestId));
    form.append("PhotoType", data.photoType || "ClockOut");
    form.append("UploadedByWorkerId", String(data.uploadedByWorkerId || 0));
    form.append("File", blob, fileName);
    const result = await postForm<unknown>("/Access/insertaccessphoto", form);
    if (typeof result === "string" && result) return result;
    if (isPlainObject(result)) {
      const path = pickStr(result, ["storagePath", "data", "path", "url"]);
      if (path) return path;
    }
    return "";
  },

  updatePhoto: (token: string, data: AccessPhoto) =>
    post<AccessPhoto | null>("/Access/updateaccessphoto", { token, ...data }),

  getOtps: (token: string) =>
    post<OTPVerification[]>("/Access/getotpverifications", { token }).then(asArray<OTPVerification>),
  insertOtp: (phoneNumber: string, expiresAt: string) =>
    post<OTPVerification & { code?: string }>("/Access/insertotpverification", {
      phoneNumber,
      expiresAt,
    }),
  verifyOtp: async (code: number) => {
    const data = await post<unknown>("/Access/verifyotp", { code });
    const row = coerceRow(data);
    const nested =
      isPlainObject(data) && (isPlainObject(data.worker) || isPlainObject(data.Worker))
        ? coerceRow(data.worker ?? data.Worker)
        : {};
    const merged = { ...nested, ...row };
    const workerId = pickNum(merged, ["workerId", "id"]);
    const hasWorkerFields = Boolean(
      pickStr(merged, ["firstName"]) ||
        pickStr(merged, ["lastName"]) ||
        pickStr(merged, ["companyName"]) ||
        pickStr(merged, ["workerPhoneNumber"]),
    );
    const worker =
      workerId && (hasWorkerFields || pickStr(merged, ["phoneNumber"]))
        ? asWorkerRow(merged)
        : workerId
          ? asWorkerRow({ ...merged, id: workerId, workerId })
          : null;
    return {
      verified: true,
      token: String(merged.token ?? row.token ?? ""),
      worker: worker?.id ? worker : null,
      phoneNumber: String(merged.phoneNumber ?? merged.workerPhoneNumber ?? ""),
    };
  },
  updateOtp: (token: string, data: OTPVerification) =>
    post<OTPVerification | null>("/Access/updateotpverification", { token, ...data }),

  getNotifications: (token: string) =>
    post<Notification[]>("/Access/getnotifications", { token }).then(asArray<Notification>),
  insertNotification: (token: string, data: Partial<Notification>) =>
    post<Notification | null>("/Access/insertnotification", { token, ...data }),
  updateNotification: (token: string, data: Partial<Notification> & { id: number }) =>
    post<Notification | null>("/Access/updatenotification", { token, ...data }),

  getAudits: async (token: string) =>
    asArray<unknown>(await post("/Access/getauditevents", { token }))
      .map((row) => asAudit(row))
      .filter((row) => row.id || row.eventType),
  insertAudit: (token: string, data: Partial<AuditEvent>) =>
    post<AuditEvent | null>(
      "/Access/insertauditevent",
      dual({
        token,
        accessRequestId: data.accessRequestId ?? null,
        workerId: data.workerId ?? null,
        userId: data.userId ?? null,
        eventType: data.eventType ?? "Note",
        description: data.description ?? "",
        ipAddress: data.ipAddress ?? "",
        metadata: data.metadata ?? "",
      }),
    ),
};
