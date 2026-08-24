import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { if (["error","warning"].includes(m.type())) console.log(m.type(), m.text()); });
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));

await page.goto("http://127.0.0.1:8080/login", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Enter console/ }).click();
await page.waitForURL("**/app");
await page.waitForTimeout(800);
await page.goto("http://127.0.0.1:8080/app/requests/2");
await page.waitForTimeout(1500);
await page.screenshot({ path: "/workspace/screenshots/detail-debug.png" });
console.log("url", page.url());
console.log("text", (await page.locator("body").innerText()).slice(0, 1500));
console.log("buttons", await page.locator("button").allInnerTexts());
await browser.close();
