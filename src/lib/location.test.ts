import assert from "node:assert/strict";
import test from "node:test";
import { inferLocationKind, matchEnteredRoom, parseEnteredRoom } from "./location.ts";
import type { Room } from "./api/types.ts";

function room(partial: Partial<Room> & Pick<Room, "id" | "roomNumber">): Room {
  return {
    workAreaId: 1,
    name: partial.name ?? "",
    qrCodeIdentifier: "",
    description: "",
    isActive: true,
    locationKind: "Apartment",
    ...partial,
  };
}

test("parseEnteredRoom infers apartment and riser", () => {
  assert.deepEqual(parseEnteredRoom("13.2"), {
    roomNumber: "13.2",
    name: "Apartment 13.2",
    locationKind: "Apartment",
  });
  assert.deepEqual(parseEnteredRoom("E2.00.21"), {
    roomNumber: "E2.00.21",
    name: "Riser E2.00.21",
    locationKind: "Riser",
  });
  assert.equal(parseEnteredRoom("Riser E2.00.21").roomNumber, "E2.00.21");
  assert.equal(parseEnteredRoom("Apartment 13.2").roomNumber, "13.2");
  assert.equal(inferLocationKind("apt 4"), "Apartment");
});

test("matchEnteredRoom uses catalog when present and misses unknown rooms", () => {
  const rooms = [
    room({ id: 1, roomNumber: "13.2", name: "Apartment 13.2" }),
    room({ id: 2, roomNumber: "E2.00.21", name: "Riser E2.00.21", locationKind: "Riser" }),
  ];
  assert.equal(matchEnteredRoom(rooms, "13.2")?.id, 1);
  assert.equal(matchEnteredRoom(rooms, "Apartment 13.2")?.id, 1);
  assert.equal(matchEnteredRoom(rooms, "E2.00.21")?.id, 2);
  assert.equal(matchEnteredRoom(rooms, "99.9"), null);
});
