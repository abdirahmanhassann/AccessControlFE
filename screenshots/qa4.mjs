import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text()); });
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));

await page.goto("http://127.0.0.1:8080/login", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.getByRole("button", { name: /Enter console/ }).click();
await page.waitForURL("**/app", { timeout: 15000 });
await page.waitForTimeout(800);
await page.goto("http://127.0.0.1:8080/app/requests/2");
await page.waitForTimeout(1000);
const ta = page.locator("textarea");
console.log("textarea", await ta.count());
if (await ta.count()) {
  await ta.fill("Scaffold strike approved. Sign in at the plant door.");
  await page.getByRole("button", { name: "Approve" }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "/workspace/screenshots/approved-v2.png" });
  console.log("badges", await page.locator(".sg-badge").allInnerTexts());
}

await page.goto("http://127.0.0.1:8080/worker", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
if (await page.getByRole("button", { name: /Start over/ }).count()) {
  await page.getByRole("button", { name: /Start over/ }).click();
  await page.waitForTimeout(300);
}
await page.locator(".sg-room-pick").filter({ hasText: "GF-12" }).click();
await page.waitForTimeout(800);
await page.locator('input[type="tel"]').fill("07700900123");
await page.getByRole("button", { name: /Send SMS code/ }).click();
await page.waitForTimeout(800);
const otp = (await page.locator(".sg-otp").innerText()).replace(/\s/g, "");
console.log("otp", otp);
await page.locator(".sg-otp-input").fill(otp);
await page.getByRole("button", { name: /^Verify$/ }).click();
await page.waitForTimeout(1400);
console.log("tom h1", await page.locator("h1").innerText());
await page.screenshot({ path: "/workspace/screenshots/tom-clockout.png" });
await browser.close();
