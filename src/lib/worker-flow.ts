import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AccessRequest, ScanQrResult, Worker } from "@/lib/api/types";

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
      version: 5,
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Partial<WorkerFlow>;
        if (s.step === "scan" && !s.qrCodeIdentifier) {
          return { ...s, step: "phone" };
        }
        return s as WorkerFlow;
      },
    },
  ),
);
