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
  await page.waitForFunction(
    (expected) => document.querySelector('input[name="pin"]')?.value.length === expected,
    pin.length,
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  // Either we land on /entry, or an error banner appears in place.
  await Promise.race([
    page.waitForURL("**/entry", { timeout: 15000 }).catch(() => {}),
    page.waitForSelector("text=/not right|locked|Too many/i", { timeout: 15000 }).catch(() => {}),
  ]);
  await page.waitForTimeout(400);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

// ---------- 0. The pad expects a full-length PIN ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Kyle", exact: true }).click();
  await page.waitForSelector('input[name="pin"]', { state: "attached" });

  const dots = await page.locator('form [aria-label$="digits entered"] > span').count();
  check("pad shows six slots", dots === 6, `${dots} slots`);

  // Four digits is no longer enough to submit.
  for (const digit of "1357") await page.getByRole("button", { name: digit, exact: true }).click();
  await page.waitForTimeout(250);
  const disabledAtFour = await page.getByRole("button", { name: "Sign in" }).isDisabled();
  check("four digits cannot be submitted", disabledAtFour);

  for (const digit of "92") await page.getByRole("button", { name: digit, exact: true }).click();
  await page.waitForTimeout(250);
  const enabledAtSix = await page.getByRole("button", { name: "Sign in" }).isEnabled();
  check("six digits enables sign in", enabledAtSix);

  // And a seventh keypress is ignored rather than overflowing.
  await page.getByRole("button", { name: "4", exact: true }).click();
  await page.waitForTimeout(200);
  const value = await page.locator('input[name="pin"]').inputValue();
  check("pad stops at six digits", value === "135792", `value ${value}`);
  await ctx.close();
}

// ---------- 1. Wrong PIN is rejected ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const wrong = PINS.Kyle === "999999" ? "111222" : "999888";
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
// Wait for the redirect itself, and assert the exact path — "/admin/login"
// also contains "/admin", so a substring check cannot tell them apart.
await admin.waitForURL((url) => new URL(url).pathname === "/admin", { timeout: 15000 })
  .catch(() => {});
await admin.waitForTimeout(400);
check("admin signs in", new URL(admin.url()).pathname === "/admin", admin.url());

text = (await admin.textContent("body")) ?? "";
check("admin sees combined pool", text.includes("$200.00"));
check("admin sees both employees", text.includes("Kyle") && text.includes("Evie"));

// ---------- 6. Employee cannot reach admin ----------
await kyle.goto(BASE + "/admin", { waitUntil: "networkidle" });
check(
  "employee blocked from admin",
  new URL(kyle.url()).pathname !== "/admin",
  kyle.url(),
);

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

// ---------- 7b. The lock guard ----------
// Give an earlier day hours but no rental count. Under day-by-day splitting
// that day pays everyone $0, so locking must refuse.
admin.on("dialog", (dialog) => dialog.accept());

const guardDate = "2026-08-25"; // inside the current period, not today
await admin.goto(`${BASE}/admin/day?date=${guardDate}`, { waitUntil: "networkidle" });
const kyleBlock = admin.locator("div").filter({ hasText: /^Kyle/ }).last();
await kyleBlock.locator('input[name="hours"]').fill("6");
await kyleBlock.getByRole("button", { name: "Save hours" }).click();
await admin.waitForTimeout(900);
check(
  "admin can add hours to an earlier day",
  /Hours saved/i.test((await admin.textContent("body")) ?? ""),
);

await admin.goto(BASE + "/admin", { waitUntil: "networkidle" });
await admin.getByRole("button", { name: /Lock period/i }).click();
await admin.waitForTimeout(1200);
let guardText = (await admin.textContent("body")) ?? "";
check("locking is blocked by the unpaid day", /Cannot lock yet/i.test(guardText));
check("the block names the day", /8\/25\/26/.test(guardText), guardText.slice(0, 0));
check("the block says who is affected", /would earn \$0/i.test(guardText));
check("period did not lock", /Open|provisional/i.test(guardText));

// Fix it the way the owner would: mark the day closed.
await admin.goto(`${BASE}/admin/day?date=${guardDate}`, { waitUntil: "networkidle" });
await admin.locator('input[name="closed"]').check();
await admin.getByRole("button", { name: "Save day" }).click();
await admin.waitForTimeout(900);
check("day marked closed", /Day saved/i.test((await admin.textContent("body")) ?? ""));

await admin.goto(BASE + "/admin", { waitUntil: "networkidle" });

// ---------- 8. Lock the period ----------
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

// ---------- 9. PIN management: weak rejection and leading zeros ----------
await admin.goto(BASE + "/admin/employees", { waitUntil: "networkidle" });

async function setPinFor(name, pin) {
  const row = admin.locator("li").filter({ hasText: name }).first();
  await row.locator('input[name="pin"]').fill(pin);
  await row.getByRole("button", { name: "Set PIN" }).click();
  await admin.waitForTimeout(900);
  return (await row.textContent()) ?? "";
}

const weakResult = await setPinFor("Taylor", "123456");
check("weak PIN refused", /too easy to guess/i.test(weakResult), weakResult.slice(-90));

// A leading zero must survive the round trip — it is a string, not a number.
const zeroResult = await setPinFor("Taylor", "083517");
check("leading-zero PIN accepted", /PIN updated/i.test(zeroResult), zeroResult.slice(-90));

const taylorCtx = await browser.newContext();
const taylor = await taylorCtx.newPage();
await pinLogin(taylor, "Taylor", "083517");
check(
  "signs in with a leading-zero PIN",
  new URL(taylor.url()).pathname === "/entry",
  taylor.url(),
);

console.log(`\n${pass.length} passed, ${fail.length} failed`);
if (fail.length) { console.log("\nFailures:"); fail.forEach((f) => console.log("  " + f)); }
await browser.close();
process.exit(fail.length ? 1 : 0);
