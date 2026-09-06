import type { Room } from "@/lib/api/types";

export const LOCATION_KINDS = ["Apartment", "Riser"] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export function asLocationKind(value: string | undefined | null): LocationKind {
  return /^riser$/i.test(String(value)) ? "Riser" : "Apartment";
}

export function locationDisplay(
  room: Pick<Room, "roomNumber" | "name" | "locationKind"> | null | undefined,
) {
  if (!room) return "location";
  const kind = asLocationKind(room.locationKind);
  if (kind === "Riser") return room.name || `Riser ${room.roomNumber}`.trim();
  return room.name || `Apartment ${room.roomNumber}`.trim();
}

export function groupedLocations(rooms: Room[]) {
  const apartments = rooms.filter((r) => asLocationKind(r.locationKind) === "Apartment");
  const risers = rooms.filter((r) => asLocationKind(r.locationKind) === "Riser");
  return { apartments, risers };
}

function norm(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function inferLocationKind(text: string): LocationKind {
  const q = text.trim();
  if (/riser/i.test(q)) return "Riser";
  if (/^(apartment|apt)\b/i.test(q)) return "Apartment";
  if (/^[A-Za-z][A-Za-z0-9]*\d/.test(q)) return "Riser";
  return "Apartment";
}

/** Normalise what a worker typed into a catalog room number / label. */
export function parseEnteredRoom(text: string): {
  roomNumber: string;
  name: string;
  locationKind: LocationKind;
} {
  const q = text.trim().replace(/\s+/g, " ");
  let locationKind = inferLocationKind(q);
  let roomNumber = q;
  if (/^riser\s+/i.test(q)) {
    locationKind = "Riser";
    roomNumber = q.replace(/^riser\s+/i, "").trim() || q;
  } else if (/^(apartment|apt)\s+/i.test(q)) {
    locationKind = "Apartment";
    roomNumber = q.replace(/^(apartment|apt)\s+/i, "").trim() || q;
  }
  const name = locationKind === "Riser" ? `Riser ${roomNumber}` : `Apartment ${roomNumber}`;
  return { roomNumber, name, locationKind };
}

/** Match what a worker typed to a catalog room on the selected tower. */
export function matchEnteredRoom(rooms: Room[], query: string): Room | null {
  const q = norm(query);
  if (!q) return null;
  const parsed = parseEnteredRoom(query);
  const number = norm(parsed.roomNumber);
  const scored = rooms
    .map((room) => {
      const roomNumber = norm(room.roomNumber);
      const name = norm(room.name);
      const label = norm(locationDisplay(room));
      let score = 0;
      if (roomNumber === q || name === q || label === q || roomNumber === number || name === norm(parsed.name)) {
        score = 3;
      } else if (roomNumber.startsWith(q) || name.startsWith(q) || label.startsWith(q) || roomNumber.startsWith(number)) {
        score = 2;
      } else if (roomNumber.includes(q) || name.includes(q) || label.includes(q)) {
        score = 1;
      }
      return { room, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  if (scored[0].score === 3) return scored[0].room;
  const top = scored.filter((row) => row.score === scored[0].score);
  return top.length === 1 ? top[0].room : null;
}
