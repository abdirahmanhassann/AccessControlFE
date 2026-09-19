import { ApiError } from "./types";
import {
  asArray,
  isPlainObject,
  num,
  pickNum,
  pickStr,
  post,
  API_BASE,
  USE_MOCK,
} from "./client-http";
import {
  asApproval,
  asAudit,
  asDepartment,
  asRequestRow,
  asRoom,
  asSite,
  asUserRow,
  asWorkArea,
  asWorkerRow,
  coerceRow,
  allFilterBody,
} from "./client-mappers";
import {
  asPagedList,
  asRequest,
  asWorker,
  dual,
  listFilterBody,
  placeholderUser,
  resolveRoom,
} from "./client-list";
import type { ListFilter, LoginResult, PagedList } from "./client-list";
import { readSession, readWorkerSession } from "@/lib/session";
import type {
  AccessPhoto,
  AccessRequest,
  AccessRequestApproval,
  AccessWindow,
  AuditEvent,
  CreateUserRequest,
  Department,
  DepartmentManagerMapping,
  DepartmentRoomMapping,
  LoginRequest,
  Notification,
  OTPVerification,
  Room,
  ScanQrResult,
  Session,
  Site,
  User,
  WorkArea,
  WorkAreaManager,
  Worker,
  WorkerSiteMapping,
  RoomManager,
} from "./types";

export const apiPart2 = {
  updateAccessRequest: (token: string | undefined, data: Partial<AccessRequest> & { id: number }) => {
    const payload: Record<string, unknown> = { ...data };
    if (token) {
      payload.token = token;
      payload.Token = token;
    }
    return post("/Access/updateaccessrequest", dual(payload));
  },
};
