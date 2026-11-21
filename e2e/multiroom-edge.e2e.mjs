/**
 * Edge cases for multi-room requests and keys, driven in a real Chromium.
 *
 *   npm run test:e2e
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
  staffLogin,
  startHarness,
  stopHarness,
  workerVerify,
} from "./helpers.mjs";

before(() => startHarness({ port: 8094 }));
after(stopHarness);

const DB_KEY = "sitegate.db.v7";

const readDb = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), DB_KEY);

async function blackOutToday(page, workAreaId) {
  await page.evaluate(
    ([key, area]) => {
      const db = JSON.parse(localStorage.getItem(key) ?? "{}");
      db.windows.push({
        id: 900 + area,
        workAreaId: area,
        dayOfWeek: new Date().getDay(),
        startTime: "00:00:00",
        endTime: "23:59:00",
        isActive: true,
      });
      localStorage.setItem(key, JSON.stringify(db));
    },
    [DB_KEY, workAreaId],
  );
}

async function addKey(page, room, label) {
  await staffLogin(page, KEYMAN);
  await open(page, "/app/keyman");
  await page.getByRole("button", { name: "Key register" }).click();
  await selectMatching(field(page, "Tower / area"), /^Tower 1$/);
  await selectMatching(field(page, "Room"), room);
  await field(page, "Key name").fill(label);
  await page.getByRole("button", { name: "Add key" }).click();
  await page.getByText(`Key ${label} added`).waitFor();
}

/** Fills the worker form up to the rooms; `rooms` are [towerPattern, roomText] pairs. */
async function startRequest(page, phone, name, rooms, { from = currentHourLocal(), to = localHHMM(120) } = {}) {
  await workerVerify(page, phone);
  await page.getByRole("heading", { name: "Access request" }).waitFor();
  await field(page, "First name").fill(name[0]);
  await field(page, "Last name").fill(name[1]);
  await field(page, "Company they work for").fill("Edge Electrical");
  await field(page, "Their supervisor").fill("Sam Super");
  await field(page, "Type of job").selectOption("Electrical");
  await field(page, "From").fill(from);
  await field(page, "To").fill(to);
  let first = true;
  for (const [tower, room] of rooms) {
    await selectMatching(field(page, "Which site"), tower);
    if (first) await selectMatching(field(page, "Department"), /^Electrical$/);
    await field(page, first ? "Room" : "Add another room").fill(room);
    await page.getByRole("button", { name: "Add room" }).click();
    await page.locator(".sg-room-chip strong", { hasText: room }).first().waitFor();
    first = false;
  }
  await field(page, "What are you doing?").fill("Edge case");
  await selectMatching(field(page, "Manager to approve"), /James Cole/);
}

test("every room in blackout hours: nothing is sent and the worker is told why", async (t) => {
  const page = await newPage(t);
  await staffLogin(page, SITE_MANAGER); // creates the demo database
  await blackOutToday(page, 1);
  await startRequest(page, "07700900601", ["Bea", "Black"], [
    [/^Riverside · Tower 1/, "13.2"],
    [/^Riverside · Tower 1/, "13.3"],
  ]);
  await page.getByRole("button", { name: "Submit request for 2 rooms" }).click();
  const alert = page.getByRole("alert");
  await alert.getByText("All of these rooms are in blackout hours right now").waitFor();
  await alert.getByText("Nothing can be sent until a blackout ends").waitFor();
  assert.equal(await alert.getByRole("button", { name: /Send for the other/ }).count(), 0, "no partial send offered");
  assert.equal(await alert.getByText("In blackout now").count(), 2);
  const db = await readDb(page);
  assert.equal((db.groups ?? []).length, 0, "nothing saved");

  // "Change rooms" closes the warning and lets the worker edit the list.
  await alert.getByRole("button", { name: "Change rooms" }).click();
  await alert.waitFor({ state: "detached" });
  await page.locator(".sg-room-chip", { hasText: "Apartment 13.3" }).getByRole("button", { name: "Remove" }).click();
  await page.locator(".sg-room-chip strong", { hasText: "Apartment 13.3" }).waitFor({ state: "detached" });
});

test("a key booked by one worker cannot be booked by another for an overlapping time", async (t) => {
  const page = await newPage(t);
  await addKey(page, /13\.4/, "13.4-A");

  // Worker A books it.
  await startRequest(page, "07700900602", ["Ann", "First"], [[/^Riverside · Tower 1/, "13.4"]]);
  await page.locator(".sg-key-option", { hasText: "13.4-A" }).locator("input").check();
  await page.getByRole("button", { name: "Submit form" }).click();
  await page.getByRole("heading", { name: "Waiting for approval" }).waitFor();

  // Worker B, same time: the key is shown but cannot be ticked.
  await page.getByRole("button", { name: "Start over" }).click();
  await startRequest(page, "07700900603", ["Ben", "Second"], [[/^Riverside · Tower 1/, "13.4"]]);
  const option = page.locator(".sg-key-option", { hasText: "13.4-A" });
  await option.getByText("already booked or out for that time").waitFor();
  assert.equal(await option.locator("input").isDisabled(), true, "booked key is disabled");

  // The server refuses it too, even if the form were bypassed.
  const result = await page.evaluate(async () => {
    const { api } = await import("/src/lib/api/client.ts");
    const db = JSON.parse(localStorage.getItem("sitegate.db.v7") ?? "{}");
    const key = db.keys.find((k) => k.label === "13.4-A");
    const worker = db.workers.find((w) => w.firstName === "Ann");
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = (d) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
    try {
      await api.insertAccessRequestGroup({
        phoneNumber: "07700900603",
        workerId: worker.id,
        siteId: 1,
        departmentId: 0,
        rooms: [{ roomId: key.roomId, workAreaId: 1, roomText: "13.4", keyIds: [key.id] }],
        reason: "x",
        workType: "Electrical",
        description: "x",
        supervisorName: "x",
        workFrom: stamp(now),
        workTo: stamp(new Date(now.getTime() + 3600_000)),
        approverUserId: 3,
      });
      return "accepted";
    } catch (err) {
      return String(err.message);
    }
  });
  assert.match(result, /already booked or out/, "server refuses a clashing key");
});

test("approve all, then the worker re-verifies, clocks in once for both rooms and signs out once", async (t) => {
  const page = await newPage(t);
  await startRequest(page, "07700900604", ["Cal", "Clock"], [
    [/^Riverside · Tower 1/, "13.5"],
    [/^Riverside · Tower 2/, "14.2"],
  ]);
  await page.getByRole("button", { name: "Submit request for 2 rooms" }).click();
  await page.getByRole("heading", { name: "Waiting for approval" }).waitFor();
  let db = await readDb(page);
  const group = db.groups.at(-1);
  const ids = db.requests.filter((r) => r.groupId === group.id).map((r) => r.id);
  assert.equal(ids.length, 2);

  await staffLogin(page, SITE_MANAGER);
  await open(page, `/app/requests/${ids[0]}`);
  const card = page.locator("section.sg-card", { hasText: "Rooms in this request" });
  await card.getByRole("button", { name: "Approve all 2 pending rooms" }).click();
  await card.getByText("2/2 decided").waitFor();
  await page.getByText("2 rooms approved").waitFor();

  // The requests list marks both rows as part of one request.
  await open(page, "/app/requests");
  await page.getByText(`1 of 2 rooms in request #${group.id}`).first().waitFor();

  // The worker comes back on a fresh verification: straight to the visit, both rooms.
  await page.evaluate(() => localStorage.removeItem("sitegate.worker-flow"));
  await workerVerify(page, "07700900604");
  await page.getByText("Approved for 2 rooms").waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "Clock in" }).click();
  await page.getByText("Clocked in to 2 rooms").waitFor();
  db = await readDb(page);
  const rows = db.requests.filter((r) => ids.includes(r.id));
  assert.ok(rows.every((r) => r.clockedInAt), "one clock-in stamps every room");
  assert.equal(new Set(rows.map((r) => r.clockedInAt)).size, 1, "same clock-in time on both rooms");

  // Sign out needs a photo of each room.
  const body = page.locator(".sg-worker-main");
  await body.getByRole("button", { name: "Sign out", exact: true }).click();
  const take = page.getByRole("button", { name: "Take photo" });
  await take.waitFor();
  await page.waitForFunction(() => {
    const v = document.querySelector("video.sg-camera-video");
    return !!v && v.videoWidth > 0;
  });
  await take.click();
  await page.locator(".sg-photo img").first().waitFor();
  await body.getByRole("button", { name: "Sign out of 2 rooms" }).click();
  await page.getByText(/Take a photo of every room before you sign out\. Still needed:/).waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".sg-photo img").length === 0); // switched to the next room
  await take.click();
  await page.locator(".sg-photo img").first().waitFor();
  await body.getByRole("button", { name: "Sign out of 2 rooms" }).click();
  await page.getByRole("heading", { name: "Visit closed" }).waitFor();
  db = await readDb(page);
  const closed = db.requests.filter((r) => ids.includes(r.id));
  assert.ok(closed.every((r) => r.clockedOutAt && r.status === "Completed"), "one sign-out closes every room");
  assert.equal(db.photos.filter((p) => ids.includes(p.accessRequestId)).length, 2, "a photo per room");
  assert.equal((db.roomLeaveReviews ?? []).filter((r) => ids.includes(r.accessRequestId)).length, 2, "a room check per room");
});

test("every room declined: the worker sees the decline with each reason", async (t) => {
  const page = await newPage(t);
  await startRequest(page, "07700900605", ["Dee", "Decline"], [
    [/^Riverside · Tower 1/, "E2.00.21"],
    [/^Riverside · Tower 1/, "E2.00.22"],
  ]);
  await page.getByRole("button", { name: "Submit request for 2 rooms" }).click();
  await page.getByRole("heading", { name: "Waiting for approval" }).waitFor();
  const db = await readDb(page);
  const ids = db.requests.filter((r) => r.groupId === db.groups.at(-1).id).map((r) => r.id);

  await staffLogin(page, SITE_MANAGER);
  await open(page, `/app/requests/${ids[0]}`);
  const card = page.locator("section.sg-card", { hasText: "Rooms in this request" });
  // A decline needs a reason.
  await card.locator(".sg-room-chip", { hasText: "E2.00.21" }).getByRole("button", { name: "Decline" }).click();
  await page.getByText("Add a reason so the worker knows why the room was declined.").waitFor();
  for (const room of ["E2.00.21", "E2.00.22"]) {
    await card.getByLabel("Reason for declining a room (sent to the worker)").fill(`Riser ${room} isolated`);
    await card.locator(".sg-room-chip", { hasText: room }).getByRole("button", { name: "Decline" }).click();
    await card.locator(".sg-room-chip", { hasText: room }).getByText("Rejected").waitFor();
  }

  await open(page, "/worker");
  await page.getByRole("heading", { name: "Request declined" }).waitFor({ timeout: 20_000 });
  await page.getByText(/Your access request was declined for/).waitFor();
  await page.getByText("Riser E2.00.22 isolated").first().waitFor();
  await page.getByRole("button", { name: "Submit a new request" }).click();
  await page.getByRole("heading", { name: "Access request" }).waitFor();
});

test("a key recorded missing can be returned later, and only from the right states", async (t) => {
  const page = await newPage(t);
  await addKey(page, /13\.3/, "13.3-M");
  await startRequest(page, "07700900606", ["Max", "Missing"], [[/^Riverside · Tower 1/, "13.3"]]);
  await page.locator(".sg-key-option", { hasText: "13.3-M" }).locator("input").check();
  await page.getByRole("button", { name: "Submit form" }).click();
  await page.getByRole("heading", { name: "Waiting for approval" }).waitFor();
  let db = await readDb(page);
  const id = db.requests.find((r) => r.groupId === db.groups.at(-1).id).id;

  // A single-room group: the normal Decision card decides it, and the key follows.
  await staffLogin(page, SITE_MANAGER);
  await open(page, `/app/requests/${id}`);
  assert.equal(await page.getByText("Rooms in this request").count(), 0, "no group card for one room");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.locator("section.sg-card", { hasText: "Keys for this room" }).getByText("Approved").waitFor();

  await staffLogin(page, KEYMAN);
  await open(page, "/app/keyman");
  const row = page.locator("section.sg-card").filter({ has: page.getByRole("button", { name: "Key register" }) }).locator("tbody tr", { hasText: "13.3-M" });
  assert.equal(await row.getByRole("button", { name: "Missing" }).count(), 0, "cannot mark missing before it is handed over");
  await row.getByRole("button", { name: "Hand over" }).click();
  await row.getByRole("button", { name: "Missing" }).click();
  await page.getByText("13.3-M recorded as missing").waitFor();
  db = await readDb(page);
  assert.equal(db.requestKeys.find((k) => k.accessRequestId === id).status, "Missing");
  // A missing key stays on the Keyman's list, flagged, until it turns up.
  await row.getByText("Missing", { exact: true }).waitFor();
  await page.getByText("1 missing", { exact: false }).waitFor();
  await row.getByRole("button", { name: "Returned" }).click();
  await page.getByText("13.3-M returned").waitFor();
  await row.waitFor({ state: "detached" });

  // That booking cannot hand it out again.
  const moved = await page.evaluate(async () => {
    const { api } = await import("/src/lib/api/client.ts");
    const session = JSON.parse(localStorage.getItem("sitegate.session") ?? "null");
    const db = JSON.parse(localStorage.getItem("sitegate.db.v7") ?? "{}");
    const k = db.requestKeys.find((x) => x.status === "Returned");
    try {
      await api.updateAccessRequestKey(session.token, { id: k.id, status: "Issued" });
      return "issued again";
    } catch (err) {
      return String(err.message);
    }
  });
  assert.match(moved, /cannot be marked issued/, "a returned key cannot be handed out again on the same booking");
  db = await readDb(page);
  assert.equal(db.requestKeys.find((k) => k.accessRequestId === id).status, "Returned");
});
