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

/** Match what a worker typed to a catalog room on the selected tower. */
export function matchEnteredRoom(rooms: Room[], query: string): Room | null {
  const q = norm(query);
  if (!q) return null;
  const scored = rooms
    .map((room) => {
      const number = norm(room.roomNumber);
      const name = norm(room.name);
      const label = norm(locationDisplay(room));
      let score = 0;
      if (number === q || name === q || label === q) score = 3;
      else if (number.startsWith(q) || name.startsWith(q) || label.startsWith(q)) score = 2;
      else if (number.includes(q) || name.includes(q) || label.includes(q)) score = 1;
      return { room, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  if (scored[0].score === 3) return scored[0].room;
  const top = scored.filter((row) => row.score === scored[0].score);
  return top.length === 1 ? top[0].room : null;
}
