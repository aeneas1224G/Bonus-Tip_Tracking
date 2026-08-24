/**
 * End-to-end smoke test against a running server.
 *
 * Setup:
 *   1. npm run db:push && npm run db:seed   (note the PINs it prints)
 *   2. npm run build && npm start -- -p 3100
 *   3. PINS='{"Kyle":"1234","Evie":"5678"}' node tests/e2e/smoke.mjs
 *
 * It signs in as two employees and the owner, logs hours and a cash tip,
 * checks the pool splits by hours, and locks the period.
 * Run it against a scratch database — it writes real rows.
 */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3100";
const PINS = JSON.parse(process.env.PINS);
const pass = [];
const fail = [];

function check(name, condition, detail = "") {
  (condition ? pass : fail).push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function pinLogin(page, name, pin) {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForSelector('input[name="pin"]', { state: "attached" });
  for (const digit of pin) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
  await page.waitForFunction(() => document.querySelector('input[name="pin"]')?.value.length === 4);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Either we land on /entry, or an error banner appears in place.
  await Promise.race([
    page.waitForURL("**/entry", { timeout: 15000 }).catch(() => {}),
    page.waitForSelector("text=/not right|locked|Too many/i", { timeout: 15000 }).catch(() => {}),
  ]);
  await page.waitForTimeout(400);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

// ---------- 1. Wrong PIN is rejected ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const wrong = PINS.Kyle === "9999" ? "1111" : "9999";
  await pinLogin(page, "Kyle", wrong);
  const body = await page.textContent("body");
  check("wrong PIN rejected", !page.url().includes("/entry") && /not right/i.test(body ?? ""));
  check("attempts remaining shown", /attempts? left/i.test(body ?? ""));
  await ctx.close();
}

// ---------- 2. Kyle signs in and logs a shift ----------
const kyleCtx = await browser.newContext();
const kyle = await kyleCtx.newPage();
await pinLogin(kyle, "Kyle", PINS.Kyle);
check("correct PIN reaches entry page", kyle.url().includes("/entry"), kyle.url());
check("greets by name", (await kyle.textContent("body"))?.includes("Hi, Kyle") ?? false);

await kyle.fill('input[name="hours"]', "10");
await kyle.getByRole("button", { name: "Save hours" }).click();
await kyle.waitForLoadState("networkidle");
await kyle.waitForTimeout(600);
check("hours saved", /Hours saved/i.test((await kyle.textContent("body")) ?? ""));

// Day numbers: 64 rentals -> $200 pool (60+ tier)
await kyle.fill('input[name="rentalCount"]', "64");
await kyle.fill('input[name="reviewCount"]', "1950");
await kyle.fill('input[name="ebikeCount"]', "58");
await kyle.getByRole("button", { name: "Save day" }).click();
await kyle.waitForLoadState("networkidle");
await kyle.waitForTimeout(600);
check("day numbers saved", /Day saved/i.test((await kyle.textContent("body")) ?? ""));

await kyle.reload({ waitUntil: "networkidle" });
let text = (await kyle.textContent("body")) ?? "";
check("64 rentals -> $200 pool", text.includes("$200.00"), "60+ tier");
check("solo worker takes the whole pool", text.includes("$200.00"));

// A cash tip is paid on top, not split
await kyle.fill('input[name="amount"]', "25");
await kyle.fill('input[name="note"]', "2 riders rescue");
await kyle.getByRole("button", { name: "Add tip" }).click();
await kyle.waitForLoadState("networkidle");
await kyle.waitForTimeout(600);
await kyle.reload({ waitUntil: "networkidle" });
text = (await kyle.textContent("body")) ?? "";
check("cash tip added on top of pool share", text.includes("$225.00"), "200 pool + 25 tip");

// ---------- 3. Evie joins the same day; pool splits by hours ----------
const evieCtx = await browser.newContext();
const evie = await evieCtx.newPage();
await pinLogin(evie, "Evie", PINS.Evie);
check("second employee signs in", evie.url().includes("/entry"));

await evie.fill('input[name="hours"]', "5");
await evie.getByRole("button", { name: "Save hours" }).click();
await evie.waitForLoadState("networkidle");
await evie.waitForTimeout(600);
await evie.reload({ waitUntil: "networkidle" });
text = (await evie.textContent("body")) ?? "";
// $200 across 15 hours: Evie 5h -> $66.67, Kyle 10h -> $133.33
check("Evie's 5 of 15 hours -> $66.67", text.includes("$66.67"));
check("Evie sees no cash tip of her own", text.includes("$66.67") && !text.includes("$225.00"));

await kyle.reload({ waitUntil: "networkidle" });
text = (await kyle.textContent("body")) ?? "";
check("Kyle's 10 of 15 hours -> $133.33", text.includes("$133.33"));
check("Kyle's total = 133.33 + 25 tip", text.includes("$158.33"));

// ---------- 4. Everyone sees everything ----------
await evie.goto(BASE + "/period", { waitUntil: "networkidle" });
text = (await evie.textContent("body")) ?? "";
check("employee can see the full period sheet", text.includes("Kyle") && text.includes("Evie"));
check("period sheet reconciles to the pool", text.includes("$200.00"));

// ---------- 5. Admin ----------
const adminCtx = await browser.newContext();
const admin = await adminCtx.newPage();
await admin.goto(BASE + "/admin", { waitUntil: "networkidle" });
check("admin page redirects anonymous to login", admin.url().includes("/admin/login"));

await admin.fill('input[name="username"]', "admin");
await admin.fill('input[name="password"]', "localtest1234");
await admin.getByRole("button", { name: "Sign in" }).click();
await admin.waitForLoadState("networkidle");
await admin.waitForTimeout(600);
check("admin signs in", admin.url().includes("/admin"), admin.url());

text = (await admin.textContent("body")) ?? "";
check("admin sees combined pool", text.includes("$200.00"));
check("admin sees both employees", text.includes("Kyle") && text.includes("Evie"));

// ---------- 6. Employee cannot reach admin ----------
await kyle.goto(BASE + "/admin", { waitUntil: "networkidle" });
check("employee blocked from admin", !kyle.url().endsWith("/admin"), kyle.url());

const employeeExport = await kyle.evaluate(async (base) => {
  const r = await fetch(base + "/api/export", { credentials: "same-origin" });
  return { status: r.status };
}, BASE);
check("employee blocked from CSV export", employeeExport.status === 403, `status ${employeeExport.status}`);

// ---------- 7. CSV export ----------
const adminExport = await admin.evaluate(async (base) => {
  const r = await fetch(base + "/api/export", { credentials: "same-origin" });
  return { status: r.status, body: await r.text() };
}, BASE);
const csv = adminExport.body;
check("admin downloads CSV", adminExport.status === 200, `status ${adminExport.status}`);
check("CSV has payroll rows", csv.includes("Kyle") && csv.includes("Evie"));
check("CSV totals reconcile", csv.includes("225.00") && csv.includes("66.67"));
check("CSV shows the working", csv.includes("Daily bonus pool") && csv.includes("200.00"));

// The anchor in the admin UI must actually produce a file.
const [download] = await Promise.all([
  admin.waitForEvent("download", { timeout: 10000 }).catch(() => null),
  admin.click('a[href^="/api/export"]').catch(() => {}),
]);
check("CSV download link works", !!download, download ? await download.suggestedFilename() : "no download");

// ---------- 8. Lock the period ----------
admin.on("dialog", (dialog) => dialog.accept());
await admin.getByRole("button", { name: /Lock period/i }).click();
await admin.waitForLoadState("networkidle");
await admin.waitForTimeout(600);
text = (await admin.textContent("body")) ?? "";
check("period locks", /locked/i.test(text));

await kyle.goto(BASE + "/entry", { waitUntil: "networkidle" });
text = (await kyle.textContent("body")) ?? "";
check("locked period is read-only for staff", /locked/i.test(text));
const saveButton = await kyle.getByRole("button", { name: "Save hours" }).count();
check("save button gone when locked", saveButton === 0);

console.log(`\n${pass.length} passed, ${fail.length} failed`);
if (fail.length) { console.log("\nFailures:"); fail.forEach((f) => console.log("  " + f)); }
await browser.close();
process.exit(fail.length ? 1 : 0);
