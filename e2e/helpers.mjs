/**
 * Shared harness for the end-to-end suites.
 *
 * Each spec file runs in its own process (node --test), starts the app in demo
 * mode on its own port, and drives a real Chromium. Demo mode means no API and
 * no database: the in-browser demo API mirrors the real endpoints, and every
 * test gets a fresh browser profile, so the seed data starts clean each time.
 *
 * First run: `npx playwright install chromium`, or point E2E_CHROMIUM_PATH at a
 * Chromium you already have. Set E2E_BASE_URL to drive a server you started
 * yourself (it must be in demo mode) and nothing is spawned. Set
 * E2E_SHOTS=<folder> to save a screenshot at each step.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

export const PASSWORD = "SiteGate1!";
export const ADMIN = "emma.hart@sitegate.demo";
export const KEYMAN = "tom.reyes@sitegate.demo";
export const SITE_MANAGER = "james.cole@sitegate.demo"; // approves for Riverside / Electrical
export const MANAGER = "priya.shah@sitegate.demo";

const SHOTS = process.env.E2E_SHOTS || "";

let server;
let browser;
let base = "";

export function baseUrl() {
  return base;
}

async function waitForServer(url, ms = 60_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server did not start at ${url}`);
}

/**
 * Start the demo server and the browser.
 *
 * `port` differs per spec file so two files can never fight over one port, even
 * if the runner is asked to go wide.
 */
export async function startHarness({ port }) {
  const chosen = Number(process.env.E2E_PORT || port);
  base = (process.env.E2E_BASE_URL || `http://127.0.0.1:${chosen}`).replace(/\/$/, "");

  if (!process.env.E2E_BASE_URL) {
    server = spawn(
      process.execPath,
      [
        "scripts/with-app-env.mjs",
        "node_modules/.bin/vite",
        "dev",
        "--host",
        "127.0.0.1",
        "--port",
        String(chosen),
      ],
      { env: { ...process.env, VITE_API_BASE_URL: "mock" }, stdio: "ignore" },
    );
  }

  await waitForServer(`${base}/login`);
  browser = await chromium.launch({
    // Use a Chromium you already have instead of `npx playwright install`.
    executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
    // A fake camera, so the worker's live sign-out photo can be taken.
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
}

export async function stopHarness() {
  await browser?.close();
  server?.kill();
}

/**
 * A time zone where it is currently late morning, so a visit booked "from now
 * for two hours" never crosses midnight whatever time the suite runs.
 */
function middayTimeZone() {
  const zones = Intl.supportedValuesOf("timeZone");
  const now = new Date();
  for (const zone of zones) {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" }).format(
        now,
      ),
    );
    if (hour >= 9 && hour <= 12) return zone;
  }
  return "UTC";
}

export const TZ = middayTimeZone();

/**
 * The top of the current hour, which is the earliest start the request form
 * accepts. Tests used to book a few minutes in the past; that is now refused.
 */
export function currentHourLocal() {
  return `${localHHMM(0).slice(0, 2)}:00`;
}

export function localHHMM(offsetMinutes) {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

export async function newPage(t) {
  const context = await browser.newContext({
    viewport: { width: 1360, height: 900 },
    timezoneId: TZ,
    permissions: ["camera"],
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  t.after(async () => {
    if (SHOTS) {
      const name = t.name.replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
      await page.screenshot({ path: join(SHOTS, `last-${name}.png`), fullPage: true }).catch(() => {});
    }
    await context.close();
    assert.deepEqual(errors, [], "no uncaught errors in the page");
  });
  return page;
}

export async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

/** Load a page fresh. The demo API keeps its data per page load, so switch actors with a full load. */
export async function open(page, path) {
  await page.goto(`${base}${path}`);
  await page.waitForLoadState("networkidle").catch(() => {});
}

export async function staffLogin(page, email, password = PASSWORD) {
  await page.evaluate(() => localStorage.removeItem("sitegate.session")).catch(() => {});
  await open(page, "/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /enter console|sign in/i }).click();
  await page.waitForURL(/\/app/, { timeout: 15_000 });
}

export async function workerVerify(page, phone) {
  await open(page, "/worker");
  await field(page, "Phone").fill(phone);
  await page.getByRole("button", { name: "Send SMS code" }).click();
  const code = (await page.locator(".sg-otp").first().textContent())?.trim() ?? "";
  assert.match(code, /^\d{6}$/, "demo SMS shows the code");
  await field(page, "Code").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
  return code;
}

/** The input/select inside the form field whose label is exactly `name` (hints sit inside the label too). */
export function field(page, name, control = "input, select, textarea") {
  return page
    .locator("label.sg-field", {
      has: page.locator(".sg-label", {
        hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
      }),
    })
    .locator(control)
    .first();
}

/** Pick the first option whose text matches, once the options have loaded. */
export async function selectMatching(select, pattern) {
  await select.locator("option", { hasText: pattern }).first().waitFor({ state: "attached" });
  const options = await select
    .locator("option")
    .evaluateAll((els) => els.map((o) => ({ value: o.value, text: o.textContent ?? "" })));
  const hit = options.find((o) => o.value && pattern.test(o.text));
  assert.ok(hit, `option matching ${pattern}`);
  await select.selectOption(hit.value);
}

export function sidebarBadge(page, href) {
  return page.locator(`.sg-nav-list a[href="${href}"] .sg-nav-count`);
}

/**
 * The Keyman page is one table with the cards along the top as filters, so a
 * test has to say which slice it is looking at before it reads a row.
 */
export async function keymanFilter(page, label) {
  await page.locator("button.sg-stat-filter", { hasText: label }).first().click();
}

/** Fill in the worker's access request form and submit it. */
export async function submitAccessRequest(page, details) {
  await page.getByRole("heading", { name: "Access request" }).waitFor();
  await field(page, "First name").fill(details.firstName);
  await field(page, "Last name").fill(details.lastName);
  await field(page, "Company they work for").fill(details.company);
  await field(page, "Their supervisor").fill(details.supervisor ?? "Site Supervisor");
  await field(page, "Type of job").selectOption(details.workType ?? "Electrical");
  await field(page, "From").fill(details.from);
  await field(page, "To").fill(details.to);
  await selectMatching(field(page, "Which site"), details.site ?? /^Riverside/);
  await selectMatching(field(page, "Department"), details.department ?? /^Electrical$/);
  await field(page, "Room").fill(details.room ?? "13.2");
  await field(page, "What are you doing?").fill(details.description ?? "Replace the consumer unit");
  await selectMatching(field(page, "Manager to approve"), details.approver ?? /James Cole/);
  await page.getByRole("button", { name: "Submit form" }).click();
}
