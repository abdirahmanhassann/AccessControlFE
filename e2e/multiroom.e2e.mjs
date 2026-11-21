/**
 * End-to-end test for multi-room requests and keys, driven in a real Chromium.
 *
 *   npm run test:e2e
 *
 * One worker asks for three rooms in two towers, with a key for one of them,
 * while one tower is in blackout hours. Only the other rooms go through. The
 * manager approves one room and declines the other; the worker hears once. The
 * worker clocks in once and signs out once with a photo of each room, and the
 * Keyman hands the key over and takes it back.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  KEYMAN,
  SITE_MANAGER,
  field,
  currentHourLocal,
  localHHMM,
  newPage,
  open,
  selectMatching,
  shot,
  staffLogin,
  startHarness,
  stopHarness,
  workerVerify,
} from "./helpers.mjs";

before(() => startHarness({ port: 8093 }));
after(stopHarness);

const DB_KEY = "sitegate.db.v7";

async function readDb(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), DB_KEY);
}

async function takePhoto(page) {
  const take = page.getByRole("button", { name: "Take photo" });
  await take.waitFor();
  await page.waitForFunction(() => {
    const v = document.querySelector("video.sg-camera-video");
    return !!v && v.videoWidth > 0;
  });
  await take.click();
}

test("multi-room request with keys, a tower in blackout, per-room decisions, one clock-in and one sign-out", async (t) => {
  const page = await newPage(t);
  const phone = "07700900777";
  const from = currentHourLocal();
  const to = localHHMM(120);

  // 1. The Keyman registers a key for Apartment 13.2.
  await staffLogin(page, KEYMAN);
  await open(page, "/app/keyman");
  await page.getByRole("button", { name: "Key register" }).click();
  await selectMatching(field(page, "Tower / area"), /^Tower 1$/);
  await selectMatching(field(page, "Room"), /13\.2/);
  await field(page, "Key name").fill("13.2-A");
  await page.getByRole("button", { name: "Add key" }).click();
  await page.getByText("Key 13.2-A added").waitFor();

  // 2. Tower 2 is in blackout hours all of today.
  await page.evaluate((key) => {
    const db = JSON.parse(localStorage.getItem(key) ?? "{}");
    db.windows.push({
      id: 900,
      workAreaId: 2,
      dayOfWeek: new Date().getDay(),
      startTime: "00:00:00",
      endTime: "23:59:00",
      isActive: true,
    });
    localStorage.setItem(key, JSON.stringify(db));
  }, DB_KEY);

  // 3. The worker asks for 13.2 (with its key) and 13.3 in Tower 1, and 14.1 in Tower 2.
  await workerVerify(page, phone);
  await page.getByRole("heading", { name: "Access request" }).waitFor();
  await field(page, "First name").fill("Grace");
  await field(page, "Last name").fill("Hopper");
  await field(page, "Company they work for").fill("Compiler Electrical");
  await field(page, "Their supervisor").fill("Howard Aiken");
  await field(page, "Type of job").selectOption("Electrical");
  await field(page, "From").fill(from);
  await field(page, "To").fill(to);
  await selectMatching(field(page, "Which site"), /^Riverside · Tower 1/);
  await selectMatching(field(page, "Department"), /^Electrical$/);
  await field(page, "Room").fill("13.2");
  await page.getByRole("button", { name: "Add room" }).click();
  const key = page.locator(".sg-key-option", { hasText: "13.2-A" }).locator("input");
  await key.waitFor();
  await key.check();
  await field(page, "Add another room").fill("13.3");
  await page.getByRole("button", { name: "Add room" }).click();
  await selectMatching(field(page, "Which site"), /^Riverside · Tower 2/);
  assert.match(
    await field(page, "Department").inputValue(),
    /\d+/,
    "changing tower on the same site keeps the department",
  );
  await field(page, "Add another room").fill("14.1");
  await page.getByRole("button", { name: "Add room" }).click();
  await field(page, "What are you doing?").fill("Second fix lighting");
  await selectMatching(field(page, "Manager to approve"), /James Cole/);
  await page.getByRole("button", { name: "Submit request for 3 rooms" }).click();

  // 4. Tower 2 is blacked out: warned, with each room's hours; the other two go.
  const warning = page.getByRole("alert");
  await warning.getByText("Some of these rooms are in blackout hours right now").waitFor();
  await warning.getByText("Only the rooms not within their blackout hours will go through").waitFor();
  const blocked = warning.locator("li", { hasText: "14.1" });
  await blocked.getByText("In blackout now").waitFor();
  assert.match(await blocked.textContent(), /00:00–23:59/, "blocked room lists its blackout hours");
  assert.match(await warning.locator("li", { hasText: "13.2" }).textContent(), /Will be sent/);
  await shot(page, "m1-blackout-warning");
  await warning.getByRole("button", { name: "Send for the other 2 room(s)" }).click();
  await page.getByRole("heading", { name: "Waiting for approval" }).waitFor();
  await page.getByText("Your request for 2 rooms is with the manager").waitFor();

  let db = await readDb(page);
  const group = db.groups?.[0];
  assert.ok(group, "a request group was saved");
  const rooms = db.requests.filter((r) => r.groupId === group.id);
  assert.equal(rooms.length, 2, "two rooms in the group; the blacked-out one was left out");
  assert.equal(db.requestKeys.length, 1, "the key was asked for");

  // 5. The manager approves 13.2 and declines 13.3, room by room.
  await staffLogin(page, SITE_MANAGER);
  await open(page, `/app/requests/${rooms.find((r) => r.roomId === 1).id}`);
  const card = page.locator("section.sg-card", { hasText: "Rooms in this request" });
  await card.waitFor();
  await card.getByText("0/2 decided").waitFor();
  await card.getByLabel("Reason for declining a room (sent to the worker)").fill("Painters in 13.3 today");
  await card.locator(".sg-room-chip", { hasText: "Apartment 13.3" }).getByRole("button", { name: "Decline" }).click();
  await page.getByText("Room declined").waitFor();
  db = await readDb(page);
  assert.equal(
    db.notifications.filter((n) => n.workerId && !n.userId && rooms.some((r) => r.id === n.accessRequestId)).length,
    0,
    "no message to the worker while a room is still undecided",
  );
  await card.locator(".sg-room-chip", { hasText: "Apartment 13.2" }).getByRole("button", { name: "Approve" }).click();
  await card.getByText("2/2 decided").waitFor();
  await page.locator("section.sg-card", { hasText: "Keys for this room" }).getByText("Approved").waitFor();
  await shot(page, "m2-manager-decided");

  // 6. One message for the whole request, with the key and when to return it; the Keyman is told.
  db = await readDb(page);
  const workerNotes = db.notifications.filter((n) => n.workerId && !n.userId && rooms.some((r) => r.id === n.accessRequestId));
  assert.equal(new Set(workerNotes.map((n) => n.message)).size, 1, "one message covers every room");
  assert.match(workerNotes[0].message, /Approved: Apartment 13\.2/);
  assert.match(workerNotes[0].message, /Declined: Apartment 13\.3 \(Painters in 13\.3 today\)/);
  assert.match(workerNotes[0].message, /13\.2-A for Apartment 13\.2, return by/);
  assert.ok(db.notifications.some((n) => n.type === "KeysToIssue"), "the Keyman gets the keys to hand out");
  assert.equal(db.requestKeys[0].status, "Approved");

  // 7. The Keyman hands the key over.
  await staffLogin(page, KEYMAN);
  await open(page, "/app/keyman");
  const keyRow = page.locator("tr", { hasText: "13.2-A" });
  await keyRow.getByText("To hand out").waitFor();
  await keyRow.getByRole("button", { name: "Hand over" }).click();
  await page.getByText("13.2-A handed over").waitFor();

  // 8. The worker clocks in once and signs out once, with a photo of the approved room.
  await open(page, "/worker");
  await page.getByText("13.2-A").first().waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "Clock in" }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Already clocked in" }).waitFor();
  const body = page.locator(".sg-worker-main");
  await body.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByText("Return your keys to the Keyman").waitFor();
  await takePhoto(page);
  await page.locator(".sg-photo img").first().waitFor();
  await body.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("heading", { name: "Visit closed" }).waitFor();

  db = await readDb(page);
  const approved = db.requests.find((r) => r.groupId === group.id && r.roomId === 1);
  const declined = db.requests.find((r) => r.groupId === group.id && r.roomId === 2);
  assert.ok(approved.clockedInAt && approved.clockedOutAt, "approved room clocked in and out");
  assert.ok(!declined.clockedInAt, "declined room was never clocked into");

  // 9. The Keyman checks the room, takes the key back and approves the room leave.
  await staffLogin(page, KEYMAN);
  await open(page, "/app/keyman");
  const checkRow = page.locator("tr", { hasText: "Grace Hopper" }).first();
  await checkRow.getByRole("button", { name: /check room/i }).click();
  const check = page.locator("article", { hasText: "Grace Hopper" });
  const keys = check.locator(".sg-room-chip", { hasText: "Keys on this visit" });
  await keys.getByText("Issued").waitFor();
  await keys.getByRole("button", { name: "Returned" }).click();
  await page.getByText("13.2-A returned").waitFor();
  // The keys table further down the page drops it too, without a reload.
  const keysCard = page.locator("section.sg-card").filter({ has: page.getByRole("button", { name: "Key register" }) });
  await keysCard.locator("tbody tr", { hasText: "13.2-A" }).waitFor({ state: "detached" });
  await shot(page, "m3-keyman-key-returned");
  await check.getByRole("button", { name: /approve/i }).click();
  await page.getByText("Room leave approved").waitFor();
  db = await readDb(page);
  assert.equal(db.requestKeys[0].status, "Returned");
});
