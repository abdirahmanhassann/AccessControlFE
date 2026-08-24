import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE", m.text());
});
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));

async function shot(name) {
  await page.screenshot({ path: `/workspace/screenshots/${name}.png`, fullPage: false });
  console.log("shot", name, "title=", await page.title(), "url=", page.url());
}

await page.goto("http://127.0.0.1:8080/worker", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await shot("worker-scan");
const room = page.locator(".sg-room-pick").filter({ hasText: "A-101" });
await room.click();
await page.waitForTimeout(800);
await shot("worker-phone");
await page.locator('input[type="tel"]').fill("07700900456");
await page.getByRole("button", { name: /Send SMS code/ }).click();
await page.waitForTimeout(800);
await shot("worker-otp");
const otpText = await page.locator(".sg-otp").innerText();
const code = otpText.replace(/\s/g, "");
console.log("OTP", code);
await page.locator(".sg-otp-input").fill(code);
await page.getByRole("button", { name: /^Verify$/ }).click();
await page.waitForTimeout(1200);
await shot("worker-after-otp");
console.log("after otp body", (await page.locator("h1").innerText()));

await page.goto("http://127.0.0.1:8080/login", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await shot("login");
await page.getByRole("button", { name: /Enter console/ }).click();
await page.waitForTimeout(1500);
await shot("manager-overview");
console.log("overview h1", await page.locator(".sg-main-bar h1").innerText().catch(() => "none"));
const pending = await page.locator(".sg-list-item").count();
console.log("pending cards", pending);
if (pending > 0) {
  await page.locator(".sg-list-item").first().click();
  await page.waitForTimeout(800);
  await shot("request-detail");
  const approve = page.getByRole("button", { name: /^Approve$/ });
  if (await approve.count()) {
    await approve.click();
    await page.waitForTimeout(800);
    await shot("request-approved");
  }
}
await page.goto("http://127.0.0.1:8080/app/rooms", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await shot("rooms");
await page.goto("http://127.0.0.1:8080/app/requests", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await shot("requests");
await page.setViewportSize({ width: 390, height: 844 });
await page.goto("http://127.0.0.1:8080/worker", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await shot("worker-mobile");
await page.goto("http://127.0.0.1:8080/app", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await shot("manager-mobile");
await browser.close();
console.log("QA done");
