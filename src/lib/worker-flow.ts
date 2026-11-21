import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AccessRequest, AccessRequestKey, GroupRoom, ScanQrResult, Worker } from "@/lib/api/types";

export type WorkerStep =
  | "scan"
  | "phone"
  | "otp"
  | "form"
  | "waiting"
  | "visit"
  | "clockout"
  | "done";

type WorkerFlow = {
  step: WorkerStep;
  qrCodeIdentifier: string;
  siteId: number;
  siteName: string;
  siteAddress: string;
  room: ScanQrResult | null;
  phoneNumber: string;
  otpCode: string;
  otpExpiresAt: string | null;
  worker: Worker | null;
  request: AccessRequest | null;
  /** Multi-room submission the current request belongs to (0 for none). */
  groupId: number;
  /** Every room of that submission, with its decision, as last loaded. */
  groupRooms: GroupRoom[];
  /** Keys asked for on that submission, as last loaded. */
  groupKeys: AccessRequestKey[];
  mode: "request" | "clockout" | "waiting" | "visit";
  set: (patch: Partial<Omit<WorkerFlow, "set" | "reset" | "startWithQr">>) => void;
  startWithQr: (qr: string) => void;
  reset: () => void;
};

const empty = {
  step: "phone" as WorkerStep,
  qrCodeIdentifier: "",
  siteId: 0,
  siteName: "",
  siteAddress: "",
  room: null,
  phoneNumber: "",
  otpCode: "",
  otpExpiresAt: null,
  worker: null,
  request: null,
  groupId: 0,
  groupRooms: [] as GroupRoom[],
  groupKeys: [] as AccessRequestKey[],
  mode: "request" as const,
};

export const useWorkerFlow = create<WorkerFlow>()(
  persist(
    (set) => ({
      ...empty,
      set: (patch) => set(patch),
      startWithQr: (qr) => set({ ...empty, qrCodeIdentifier: qr, step: "scan" }),
      reset: () => set(empty),
    }),
    {
      name: "sitegate.worker-flow",
      version: 6,
      migrate: (persisted) => {
        const s = { groupId: 0, groupRooms: [], groupKeys: [], ...((persisted ?? {}) as Partial<WorkerFlow>) };
        if (s.step === "scan" && !s.qrCodeIdentifier) {
          return { ...s, step: "phone" };
        }
        return s as WorkerFlow;
      },
    },
  ),
);
