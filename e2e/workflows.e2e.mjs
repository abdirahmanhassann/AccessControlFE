/**
 * End-to-end tests for the everyday workflows: getting an account, signing in,
 * raising an access request, and the manager and Admin jobs around it.
 *
 *   npm run test:e2e
 *
 * The Keyman room check has its own file (keyman.e2e.mjs); the harness both
 * share lives in helpers.mjs.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN,
  MANAGER,
  PASSWORD,
  SITE_MANAGER,
  field,
  localHHMM,
  newPage,
  open,
  shot,
  staffLogin,
  startHarness,
  stopHarness,
  submitAccessRequest,
  workerVerify,
} from "./helpers.mjs";

before(() => startHarness({ port: 8092 }));
after(stopHarness);

test("staff accounts are made in the console, not by signing up, and the new account works", async (t) => {
  const page = await newPage(t);

  // 1. The public signup page does not create accounts.
  await open(page, "/signup");
  await page.getByRole("heading", { name: "Account closed" }).waitFor();
  assert.equal(
    await page.locator("form").count(),
    0,
    "nothing on /signup takes an email and password",
  );

  // 2. An Admin adds a manager from the Staff tab.
  const email = `nina.okafor.${Date.now()}@sitegate.demo`;
  const theirPassword = "NewStarter1!";
  await staffLogin(page, ADMIN);
  await open(page, "/app/staff");
  await page.getByRole("button", { name: "Add staff" }).click();
  await page.getByRole("dialog").waitFor();
  await field(page, "First name").fill("Nina");
  await field(page, "Last name").fill("Okafor");
  await field(page, "Email").fill(email);
  await field(page, "Phone").fill("07700900321");
  await field(page, "Password").fill(theirPassword);
  await field(page, "Role").selectOption("Manager");
  await shot(page, "c1-new-staff");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const row = page.locator("tr", { hasText: email });
  await row.waitFor();
  await row.getByText("Manager").waitFor();

  // 3. That account can sign in, and lands in the console.
  await staffLogin(page, email, theirPassword);
  await page.getByRole("link", { name: "Overview" }).first().waitFor();
  assert.match(page.url(), /\/app/, "the new manager is in the console");
});

test("the wrong password is refused and no session is left behind", async (t) => {
  const page = await newPage(t);

  await open(page, "/login");
  await page.locator('input[type="email"]').fill(ADMIN);
  await page.locator('input[type="password"]').fill("NotThePassword1!");
  await page.getByRole("button", { name: /enter console|sign in/i }).click();

  await page.locator(".sg-error", { hasText: /incorrect email or password/i }).waitFor();
  assert.match(page.url(), /\/login/, "still on the sign-in page");
  const session = await page.evaluate(() => localStorage.getItem("sitegate.session"));
  assert.equal(session, null, "a refused sign-in stores no session");
});

test("a worker verifies a new phone, requests access, and the manager sees it waiting", async (t) => {
  const page = await newPage(t);
  const phone = "07700900811";

  // 1. A phone the demo data has never seen goes straight to the request form.
  await workerVerify(page, phone);
  await submitAccessRequest(page, {
    firstName: "Grace",
    lastName: "Hopper",
    company: "Hopper Electrical",
    from: localHHMM(-5),
    to: localHHMM(120),
    room: "14.1",
    description: "Second fix in the riser",
  });
  await page.getByRole("heading", { name: "Waiting for approval" }).waitFor();
  await shot(page, "c2-worker-waiting");

  // 2. It is waiting for the manager they picked, as Pending.
  await staffLogin(page, SITE_MANAGER);
  await open(page, "/app/requests");
  const row = page.locator("tr", { hasText: "Grace Hopper" });
  await row.waitFor();
  await row.getByText("Pending").waitFor();
});

test("a manager rejects a request and the worker's phone says so", async (t) => {
  const page = await newPage(t);
  const phone = "07700900812";

  await workerVerify(page, phone);
  await submitAccessRequest(page, {
    firstName: "Alan",
    lastName: "Turing",
    company: "Turing Electrical",
    from: localHHMM(-5),
    to: localHHMM(120),
    room: "15.3",
    description: "Trace the ring main",
  });
  await page.getByRole("heading", { name: "Waiting for approval" }).waitFor();

  // The manager turns it down.
  await staffLogin(page, SITE_MANAGER);
  await open(page, "/app/requests");
  await page.getByRole("link", { name: /Alan Turing/ }).first().click();
  await page.getByRole("heading", { name: "Decision" }).waitFor();
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  const toast = await page.locator(".sg-toast").textContent({ timeout: 10_000 });
  assert.equal(toast?.trim(), "Rejected", "the rejection saved");

  // Back on the worker's phone.
  await open(page, "/worker");
  await page.getByRole("heading", { name: "Request declined" }).waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "Submit a new request" }).waitFor();
  await shot(page, "c3-worker-declined");
});

test("an overdue visit is listed for the manager and can be closed from the request", async (t) => {
  const page = await newPage(t);

  // Demo request #6: Tom Brennan, clocked in, time frame already over.
  await staffLogin(page, SITE_MANAGER);
  await open(page, "/app/overdue");
  await page.getByRole("heading", { name: "Overdue clock-outs" }).waitFor();
  const row = page.locator(".sg-list-item", { hasText: "Tom Brennan" });
  await row.waitFor();
  await shot(page, "c4-overdue");

  await open(page, "/app/requests/6");
  await page.getByRole("button", { name: "Sign worker out" }).click();
  await page.getByText("Worker signed out").waitFor();

  // Once closed it is no longer overdue.
  await open(page, "/app/overdue");
  await page.getByRole("heading", { name: "Overdue clock-outs" }).waitFor();
  assert.equal(
    await page.locator(".sg-list-item", { hasText: "Tom Brennan" }).count(),
    0,
    "a signed-out visit drops off the overdue list",
  );
});

test("an Admin sets the auto-block limits and they stick; a manager cannot change them", async (t) => {
  const page = await newPage(t);

  await staffLogin(page, ADMIN);
  await open(page, "/app/settings");
  const overdue = field(page, "Late sign-outs before blocking");
  const photos = field(page, "Rejected room leaves before blocking");
  await overdue.waitFor();

  await overdue.fill("5");
  await photos.fill("2");
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.getByText("Settings saved").waitFor();
  await shot(page, "c5-settings");

  // A full reload: the numbers came back from the API, not from the form state.
  await open(page, "/app/settings");
  assert.equal(await field(page, "Late sign-outs before blocking").inputValue(), "5");
  assert.equal(await field(page, "Rejected room leaves before blocking").inputValue(), "2");

  // A manager sees them, read-only.
  await staffLogin(page, MANAGER);
  await open(page, "/app/settings");
  const theirs = field(page, "Late sign-outs before blocking");
  await theirs.waitFor();
  assert.equal(await theirs.inputValue(), "5", "a manager sees what the Admin set");
  assert.equal(await theirs.isDisabled(), true, "and cannot edit it");
  await page.getByText("Only an Admin can change these.").waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Save settings" }).count(),
    0,
    "no save button for a manager",
  );
});
