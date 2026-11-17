import { formatDistanceToNow, format, parseISO, isValid } from "date-fns";

export function fullName(first?: string | null, last?: string | null) {
  return [first, last].filter(Boolean).join(" ").trim() || "Unknown";
}

export function initials(first?: string | null, last?: string | null) {
  const a = (first ?? "").trim().charAt(0);
  const b = (last ?? "").trim().charAt(0);
  return ((a + b) || "?").toUpperCase();
}

export function prettyPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("07")) {
    return `${d.slice(0, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  }
  return phone;
}

export function when(iso?: string | null) {
  if (!iso) return "—";
  const d = parseISO(iso);
  if (!isValid(d)) return "—";
  return formatDistanceToNow(d, { addSuffix: true });
}

export function whenReviewed(iso?: string | null) {
  if (!iso) return "Not reviewed";
  return when(iso);
}

export function whenExact(iso?: string | null) {
  if (!iso) return "—";
  const d = parseISO(iso);
  if (!isValid(d)) return "—";
  return format(d, "d MMM yyyy, HH:mm");
}

/**
 * "16 Nov, 09:00 – 17:00" when both ends fall on the same day, otherwise both
 * ends in full. An open end shows as "—".
 */
export function timeRange(start?: string | null, end?: string | null) {
  const parse = (iso?: string | null) => {
    if (!iso) return null;
    const d = parseISO(iso);
    return isValid(d) ? d : null;
  };
  const a = parse(start);
  const b = parse(end);
  if (!a && !b) return "—";
  if (a && b && format(a, "yyyy-MM-dd") === format(b, "yyyy-MM-dd")) {
    return `${format(a, "d MMM, HH:mm")} – ${format(b, "HH:mm")}`;
  }
  return `${a ? format(a, "d MMM, HH:mm") : "—"} – ${b ? format(b, "d MMM, HH:mm") : "—"}`;
}

export function timeSpan(value?: string | null) {
  if (!value) return "—";
  return value.slice(0, 5);
}

export function statusTone(status: string) {
  const s = status.toLowerCase();
  if (s === "upcoming") return "accent";
  if (s === "on site") return "ok";
  if (s === "overdue") return "danger";
  if (s === "approved" || s === "completed" || s === "sent" || s === "read" || s === "active") {
    return s === "completed" || s === "read" ? "muted" : "ok";
  }
  if (s === "pending" || s === "queued") return "warn";
  if (s === "rejected" || s === "failed" || s === "cancelled") return "danger";
  return "muted";
}
