import { clearSession } from "@/lib/session";

export function isStaffTokenError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("token invalid") ||
    m.includes("token expired") ||
    (m.includes("token") && m.includes("expired")) ||
    m.includes("invalid or expired")
  );
}

/** Clear staff session and send managers back to login when the API rejects the token. */
export function forceStaffLogin(message: string) {
  if (typeof window === "undefined") return;
  if (!isStaffTokenError(message)) return;
  clearSession();
  const path = window.location.pathname;
  // Staff console only — worker OTP flow and login stay put.
  if (!path.startsWith("/app")) return;
  window.location.assign("/login");
}
