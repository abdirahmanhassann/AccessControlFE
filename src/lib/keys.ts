/** Badge tone for where a key is: approved (to hand out), issued (out), returned, missing. */
export function keyTone(status: string): "ok" | "warn" | "danger" | "accent" | "muted" {
  if (/^approved$/i.test(status)) return "accent";
  if (/^issued$/i.test(status)) return "warn";
  if (/^returned$/i.test(status)) return "ok";
  if (/^(missing|rejected)$/i.test(status)) return "danger";
  return "muted";
}

/** Fired after a key or room decision changes, so every key list on screen reloads at once. */
export const KEYS_CHANGED_EVENT = "sitegate:keys-changed";

export function announceKeysChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(KEYS_CHANGED_EVENT));
}

/** Calls `reload` whenever keys change elsewhere on the page. */
export function onKeysChanged(reload: () => void) {
  window.addEventListener(KEYS_CHANGED_EVENT, reload);
  return () => window.removeEventListener(KEYS_CHANGED_EVENT, reload);
}

/** Two key names are the same key when they match ignoring capitals, spaces, hyphens and underscores (as the database does). */
export function keyNameKey(label: string) {
  return label.replace(/[\s_-]+/g, "").toUpperCase();
}

/** A typed key name tidied up: trimmed, inner spaces collapsed. */
export function cleanKeyName(label: string) {
  return label.trim().replace(/\s+/g, " ").slice(0, 100);
}
