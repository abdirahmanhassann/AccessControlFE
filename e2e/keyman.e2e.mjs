/**
 * End-to-end tests for the Keyman room check, driven in a real Chromium.
 *
 *   npm run test:e2e
 *
 * The harness (demo server, browser, page helpers) lives in ./helpers.mjs.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  KEYMAN,
  SITE_MANAGER,
  MANAGER,
  field,
  keymanFilter,
  currentHourLocal,
  localHHMM,
  newPage,
  open,
  selectMatching,
  shot,
  sidebarBadge,
  staffLogin,
  startHarness,
  stopHarness,
  workerVerify,
} from "./helpers.mjs";

before(() => startHarness({ port: 8091 }));
after(stopHarness);

test("worker visit → manager approves → sign-out with photo → Keyman approves the room", async (t) => {
  const page = await newPage(t);
  const phone = "07700900999";
  const from = currentHourLocal();
  const to = localHHMM(120);

  // 1. A new worker asks for access.
  await workerVerify(page, phone);
  await page.getByRole("heading", { name: "Access request" }).waitFor();
  await field(page, "First name").fill("Ada");
  await field(page, "Last name").fill("Lovelace");
  await field(page, "Company they work for").fill("Analytical Electrical");
  await field(page, "Their supervisor").fill("Charles Babbage");
  await field(page, "Type of job").selectOption("Electrical");
  await field(page, "From").fill(from);
  await field(page, "To").fill(to);
  await selectMatching(field(page, "Which site"), /^Riverside/);
  await selectMatching(field(page, "Department"), /^Electrical$/);
  await field(page, "Room").fill("13.2");
  await field(page, "What are you doing?").fill("Replace the consumer unit");
  await selectMatching(field(page, "Manager to approve"), /James Cole/);
  await shot(page, "a1-worker-request");
  await page.getByRole("button", { name: "Submit form" }).click();
  await page.getByRole("heading", { name: "Waiting for approval" }).waitFor();

  // 2. The site manager approves it.
  await staffLogin(page, SITE_MANAGER);
  await open(page, "/app/requests");
  await page.getByRole("link", { name: /Ada Lovelace/ }).first().click();
  await page.getByRole("heading", { name: "Decision" }).waitFor();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  const toastText = await page.locator(".sg-toast").textContent({ timeout: 10_000 });
  assert.equal(toastText?.trim(), "Approved", "manager approval saved");
  const requestUrl = page.url();

  // 3. The Keyman sees it under Active requests, in the sidebar and on the tab.
  await staffLogin(page, KEYMAN);
  const visit = page.locator(".sg-nav-visit", { hasText: "Ada Lovelace" });
  await visit.waitFor();
  assert.match(await visit.textContent(), new RegExp(`${from} – ${to}`), "sidebar shows start – end");
  await open(page, "/app/keyman");
  await keymanFilter(page, "Active requests");
  const row = page.locator("tr", { hasText: "Ada Lovelace" });
  await row.waitFor();
  assert.match(await row.textContent(), new RegExp(`${from} – ${to}`));
  await shot(page, "a2-keyman-active");

  // 4. Back on the worker's phone the waiting screen has picked up the approval
  //    (the verified session lasts the shift). Clock in, then sign out with a live photo.
  await open(page, "/worker");
  await page.getByRole("button", { name: "Clock in" }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Already clocked in" }).waitFor();
  // (Scoped to the page body: the header also has a "Sign out" that ends the phone session.)
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
  await shot(page, "a3-worker-signout");
  await body.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("heading", { name: "Visit closed" }).waitFor();
  await page.getByText("the Keyman has been asked to check the room").waitFor();

  // 5. The Keyman is pinged: badge, room check card with the photo.
  await staffLogin(page, KEYMAN);
  await sidebarBadge(page, "/app/keyman").filter({ hasText: "1" }).waitFor();
  assert.equal(await page.locator(".sg-nav-visit", { hasText: "Ada Lovelace" }).count(), 0, "no longer active");
  await open(page, "/app/keyman");
  // "Rooms to check" is the tab the page opens on, so her row is already there.
  const checkRow = page.locator("tr", { hasText: "Ada Lovelace" });
  await checkRow.waitFor();
  await checkRow.getByRole("button", { name: /check room/i }).click();
  const card = page.locator("article", { hasText: "Ada Lovelace" });
  await card.waitFor();
  assert.equal(await card.locator(".sg-photo img").count(), 1, "the worker's photo is on the card");
  await shot(page, "a4-keyman-check");

  // 6. Approve the room leave.
  await card.getByRole("button", { name: /approve/i }).click();
  await page.getByText("Room leave approved").waitFor();
  await keymanFilter(page, "All");
  await page.locator("tr", { hasText: "Ada Lovelace" }).getByText("Room OK").waitFor();
  await page.waitForFunction(
    () => !document.querySelector('.sg-nav-list a[href="/app/keyman"] .sg-nav-count'),
    undefined,
    { timeout: 5000 },
  );
  await shot(page, "a5-keyman-approved");

  // 7. The request page and audit trail record it.
  await open(page, new URL(requestUrl).pathname);
  await page.getByRole("heading", { name: "Room check" }).waitFor();
  await page.getByText("Room OK").waitFor();
  for (const event of ["RoomLeaveRequested", "RoomLeaveApproved", "ClockedOut"]) {
    await page.locator(".sg-tl-item strong", { hasText: event }).first().waitFor();
  }
});

test("manager signs out an overdue worker → Keyman must give a reason to reject", async (t) => {
  const page = await newPage(t);

  // Demo request #6: Tom Brennan, clocked in, time frame already over.
  await staffLogin(page, SITE_MANAGER);
  await open(page, "/app/requests/6");
  await page.getByRole("button", { name: "Sign worker out" }).click();
  await page.getByText("Worker signed out").waitFor();

  await staffLogin(page, KEYMAN);
  await open(page, "/app/keyman");
  const checkRow = page.locator("tr", { hasText: "Tom Brennan" });
  await checkRow.waitFor();
  await checkRow.getByRole("button", { name: /check room/i }).click();
  const card = page.locator("article", { hasText: "Tom Brennan" });
  await card.waitFor();
  await card.getByText(/No photos on this visit/).waitFor();

  await card.getByRole("button", { name: "Reject…" }).click();
  await card.getByRole("button", { name: "Reject room leave" }).click();
  await card.getByText("Say what is wrong with the room.").waitFor();

  const reason = "Ceiling tile left out above the riser door";
  await card.getByLabel("Reason for rejecting").fill(reason);
  await card.getByRole("button", { name: "Reject room leave" }).click();
  await page.getByText("Room leave rejected").waitFor();
  await keymanFilter(page, "Rejected room leaves");
  const done = page.locator("tr", { hasText: "Tom Brennan" });
  await done.getByText("Rejected").waitFor();
  await done.getByText(reason).waitFor();
  await shot(page, "b1-keyman-rejected");

  // The manager who approved the visit is told, with the reason.
  const note = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sitegate.db.v7") ?? "{}").notifications?.find(
      (n) => n.type === "RoomLeaveRejected",
    ),
  );
  assert.ok(note, "approving manager gets a notification");
  assert.match(note.message, new RegExp(reason));

  await open(page, "/app/requests/6");
  await page.getByRole("heading", { name: "Room check" }).waitFor();
  await page.locator(".sg-card p.sg-error", { hasText: reason }).waitFor();
  await page.locator(".sg-tl-item strong", { hasText: "RoomLeaveRejected" }).first().waitFor();
});

test("only Keyman and Admin get the Keyman tab; managers cannot sign off rooms", async (t) => {
  const page = await newPage(t);

  await staffLogin(page, MANAGER);
  const nav = await page.locator(".sg-nav-list a").allTextContents();
  assert.ok(!nav.some((n) => n.startsWith("Keyman")), "no Keyman tab for a manager");
  assert.equal(await page.locator(".sg-nav-section").count(), 0, "no active-requests sidebar for a manager");

  // Even on the page itself a manager can only look.
  await open(page, "/app/requests/6");
  await page.getByRole("button", { name: "Sign worker out" }).click();
  await page.getByText("Worker signed out").waitFor();
  await open(page, "/app/keyman");
  await page.getByText("only a Keyman or an Admin can sign them off").waitFor();
  assert.equal(await page.getByRole("button", { name: /approve/i }).count(), 0);

  // Keyman is a staff role with manager access: listed on Staff, mappable to departments.
  await staffLogin(page, "emma.hart@sitegate.demo"); // Admin
  await page.locator('.sg-nav-list a[href="/app/keyman"]').waitFor();
  await open(page, "/app/staff");
  await page.locator("td", { hasText: /^Keyman$/ }).first().waitFor();
  await page.getByRole("button", { name: "Add staff" }).first().click();
  const roles = await field(page, "Role").locator("option").allTextContents();
  assert.ok(roles.includes("Keyman"), "Keyman can be picked when adding staff");
});
