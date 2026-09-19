import { ApiError } from "./types";
import {
  asArray,
  isPlainObject,
  num,
  pickNum,
  pickStr,
  post,
} from "./client-http";
import {
  asDepartment,
  asRoom,
  asSite,
  asUserRow,
  asWorkArea,
  coerceRow,
  allFilterBody,
} from "./client-mappers";
import {
  dual,
  placeholderUser,
  resolveRoom,
} from "./client-list";
import type { LoginResult } from "./client-list";
import { readSession, readWorkerSession } from "@/lib/session";
import type {
  CreateUserRequest,
  Department,
  DepartmentManagerMapping,
  DepartmentRoomMapping,
  LoginRequest,
  Room,
  Site,
  User,
  WorkArea,
  WorkAreaManager,
  WorkerSiteMapping,
} from "./types";

export const apiPart1a = {
  login: async (req: LoginRequest): Promise<LoginResult> => {
    const data = await post<unknown>("/Access/login", req);
    const token =
      typeof data === "string"
        ? data
        : isPlainObject(data)
          ? String(data.token ?? data.Token ?? "")
          : "";
    if (!token) throw new ApiError(401, "Login did not return a token.");
    let user: User | undefined;
    try {
      const users = asArray<unknown>(await post("/Access/getusers", { token })).map((row) =>
        asUserRow(row),
      );
      user =
        users.find((u) => u.email?.toLowerCase() === req.email.toLowerCase()) ?? users[0];
    } catch {
      /* token is still usable */
    }
    return { token, user: user ?? placeholderUser(req.email) };
  },
  signup: (req: CreateUserRequest) => post<unknown>("/Access/signup", { ...req, Token: req.token, token: req.token }),
  requestPasswordReset: async (email: string) => {
    const data = await post<unknown>("/Access/requestpasswordreset", { email, Email: email });
    const row = coerceRow(data);
    return { sent: true, code: pickStr(row, ["code"]) || undefined };
  },
  resetPassword: (data: { email: string; code: string; password: string }) =>
    post<unknown>("/Access/resetpassword", {
      email: data.email,
      Email: data.email,
      code: data.code,
      Code: Number(data.code) || data.code,
      password: data.password,
      Password: data.password,
    }),
  scanQr: async (qrCodeIdentifier: string) => {
    const raw = await post<unknown>("/Access/scanqr", { qrCodeIdentifier, QrCodeIdentifier: qrCodeIdentifier });
    return resolveRoom(qrCodeIdentifier, raw);
  },
  getSites: (token: string) =>
    post("/Access/getsites", { token }).then((data) => asArray<unknown>(data).map(asSite)),
  listSites: async () =>
    asArray<unknown>(
      await post("/Access/getsites", {
        token: readWorkerSession()?.token || readSession()?.token || "",
      }),
    )
      .map(asSite)
      .filter((s) => s.id && s.name),
  insertSite: (token: string, data: Partial<Site>) => post("/Access/insertsite", dual({ token, ...data })),
  updateSite: (token: string, data: Site) => post("/Access/updatesite", dual({ token, ...data })),
  getWorkAreas: (token: string) =>
    post("/Access/getworkareas", { token }).then((data) => asArray<unknown>(data).map(asWorkArea)),
  listTowers: async (siteId: number) =>
    asArray<unknown>(
      await post("/Access/getworkareas", {
        token: readWorkerSession()?.token || readSession()?.token || "",
        siteId,
        SiteId: siteId,
      }),
    )
      .map(asWorkArea)
      .filter((a) => a.id && a.name && (!siteId || !a.siteId || a.siteId === siteId)),
  listLocations: async (workAreaId: number, siteId?: number) =>
    asArray<unknown>(
      await post("/Access/getrooms", {
        token: readWorkerSession()?.token || readSession()?.token || "",
        workAreaId,
        WorkAreaId: workAreaId,
        siteId,
        SiteId: siteId,
      }),
    )
      .map(asRoom)
      .filter((r) => r.id),
  insertWorkArea: (token: string, data: Partial<WorkArea>) =>
    post("/Access/insertworkarea", dual({ token, ...data })),
  updateWorkArea: (token: string, data: WorkArea) =>
    post("/Access/updateworkarea", dual({ token, ...data })),
  getUsers: (token: string) =>
    post("/Access/getusers", { token }).then((data) => asArray<unknown>(data).map(asUserRow)),
  listManagers: async (roomId?: number, departmentId?: number) => {
    if (roomId || departmentId) {
      return asArray<unknown>(
        await post("/Access/getmanagersforroom", {
          roomId: roomId ?? 0,
          RoomId: roomId ?? 0,
          departmentId: departmentId ?? 0,
          DepartmentId: departmentId ?? 0,
        }),
      ).map(asUserRow);
    }
    return asArray<unknown>(
      await post("/Access/getusers", {
        token: readWorkerSession()?.token || readSession()?.token || "",
      }),
    )
      .map(asUserRow)
      .filter((u) => /manager|admin/i.test(String(u.role)));
  },
  insertUser: (token: string, data: Partial<User> & { password?: string }) =>
    post("/Access/insertuser", dual({ token, ...data })),
  updateUser: (token: string, data: User) => post("/Access/updateuser", dual({ token, ...data })),
  setUserPassword: (token: string, data: { userId: number; password: string }) =>
    post("/Access/setuserpassword", dual({ token, ...data })),
  getWorkAreaManagers: (token: string) =>
    post("/Access/getworkareamanagers", { token }).then(asArray),
  insertWorkAreaManager: (token: string, data: { workAreaId: number; managerUserId: number; isPrimary?: boolean }) =>
    post("/Access/insertworkareamanager", dual({ token, ...data, isPrimary: data.isPrimary ?? false })),
  updateWorkAreaManager: (token: string, data: WorkAreaManager) =>
    post("/Access/updateworkareamanager", dual({ token, ...data })),
  getDepartments: (token: string, siteId?: number) =>
    post("/Access/getdepartments", { token, siteId, SiteId: siteId }).then((data) =>
      asArray<unknown>(data).map(asDepartment),
    ),
  listDepartments: async (siteId: number) =>
    asArray<unknown>(
      await post("/Access/getdepartments", {
        token: readWorkerSession()?.token || readSession()?.token || "",
        siteId,
        SiteId: siteId,
      }),
    )
      .map(asDepartment)
      .filter((d) => d.id && d.name && d.isActive !== false && (!siteId || !d.siteId || d.siteId === siteId)),
  listDepartmentsForRoom: async (roomId: number) =>
    asArray<unknown>(await post("/Access/getdepartmentsforroom", { roomId, RoomId: roomId }))
      .map(asDepartment)
      .filter((d) => d.id && d.name && d.isActive !== false),
  insertDepartment: (token: string, data: { siteId: number; name: string; description?: string }) =>
    post("/Access/insertdepartment", dual({ token, ...data })),
  updateDepartment: (token: string, data: Department) =>
    post("/Access/updatedepartment", dual({ token, ...data })),
  getDepartmentRoomMappings: (token: string) =>
    post<DepartmentRoomMapping[]>("/Access/getdepartmentroommappings", { token }).then(
      asArray<DepartmentRoomMapping>,
    ),
  insertDepartmentRoomMapping: (token: string, data: { departmentId: number; roomId: number }) =>
    post("/Access/insertdepartmentroommapping", dual({ token, ...data })),
  deleteDepartmentRoomMapping: (token: string, id: number) =>
    post("/Access/deletedepartmentroommapping", dual({ token, id })),
  getDepartmentManagerMappings: (token: string) =>
    post<DepartmentManagerMapping[]>("/Access/getdepartmentmanagermappings", { token }).then(
      asArray<DepartmentManagerMapping>,
    ),
  insertDepartmentManagerMapping: (
    token: string,
    data: { departmentId: number; userId: number; isPrimary?: boolean },
  ) => post("/Access/insertdepartmentmanagermapping", dual({ token, ...data, isPrimary: data.isPrimary ?? false })),
  deleteDepartmentManagerMapping: (token: string, id: number) =>
    post("/Access/deletedepartmentmanagermapping", dual({ token, id })),
  getWorkerSiteMappings: (token: string) =>
    post<WorkerSiteMapping[]>("/Access/getworkersitemappings", { token }).then(asArray<WorkerSiteMapping>),
  insertWorkerSiteMapping: (token: string, data: { workerId: number; siteId: number }) =>
    post("/Access/insertworkersitemapping", dual({ token, ...data })),
  deleteWorkerSiteMapping: (token: string, id: number) =>
    post("/Access/deleteworkersitemapping", dual({ token, id })),
};
