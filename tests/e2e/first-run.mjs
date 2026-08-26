/**
 * First-run smoke test: an empty database, brought up entirely through the
 * browser, exactly as a fresh deployment would be.
 *
 * Setup:
 *   1. Create an EMPTY database and run: npx prisma migrate deploy
 *      (do NOT seed — the point is that seeding is not required)
 *   2. SETUP_TOKEN=<token> npm start -- -p 3100
 *   3. SETUP_TOKEN=<token> node tests/e2e/first-run.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const TOKEN = process.env.SETUP_TOKEN;
if (!TOKEN) {
  console.error("Set SETUP_TOKEN to the same value the server was started with.");
  process.exit(1);
}

const pass = [];
const fail = [];
const check = (name, ok, detail = "") => {
  (ok ? pass : fail).push(name);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await browser.newContext();
const page = await ctx.newPage();

// ---------- An empty instance sends you to setup ----------
await page.goto(BASE + "/", { waitUntil: "networkidle" });
check("empty instance redirects to setup", new URL(page.url()).pathname === "/setup", page.url());
check(
  "setup explains itself",
  ((await page.textContent("body")) ?? "").includes("create the owner account"),
);

// ---------- The token actually gates it ----------
const fillSetup = async (token, username, password, confirm = password) => {
  await page.fill('input[name="token"]', token);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="confirm"]', confirm);
  await page.getByRole("button", { name: /Create owner account/i }).click();
  await page.waitForTimeout(1200);
};

await fillSetup("wrong-token-entirely", "owner", "a-very-long-password-1");
check(
  "wrong setup token refused",
  /setup token is not right/i.test((await page.textContent("body")) ?? ""),
);
check("still on setup", new URL(page.url()).pathname === "/setup");

// ---------- Weak input refused ----------
await fillSetup(TOKEN, "owner", "short");
check(
  "short password refused",
  /at least 12 characters/i.test((await page.textContent("body")) ?? ""),
);

await fillSetup(TOKEN, "owner", "a-very-long-password-1", "a-different-password-2");
check(
  "mismatched passwords refused",
  /do not match/i.test((await page.textContent("body")) ?? ""),
);

// ---------- The real thing ----------
await fillSetup(TOKEN, "owner", "a-very-long-password-1");
await page.waitForTimeout(800);
check(
  "setup completes and lands on Employees",
  new URL(page.url()).pathname === "/admin/employees",
  page.url(),
);
check(
  "signed in as the owner already",
  ((await page.textContent("body")) ?? "").includes("Employees"),
);

// ---------- The bonus ladders came with it ----------
await page.goto(BASE + "/admin/settings", { waitUntil: "networkidle" });
const rates = (await page.textContent("body")) ?? "";
check("rental ladder installed", rates.includes("130+ rentals") && rates.includes("10+ rentals"));
check("review ladder installed", rates.includes("under 75"));
const rescue = await page.locator('input[name="rescueDefault"]').inputValue();
check("rescue rate installed at $25", rescue === "25.00", rescue);
const topTier = await page.locator('input[name="rental.130"]').inputValue();
check("top tier is $800", topTier === "800.00", topTier);

// ---------- Setup closes behind itself ----------
const fresh = await browser.newContext();
const stranger = await fresh.newPage();
await stranger.goto(BASE + "/setup", { waitUntil: "networkidle" });
check(
  "setup is closed once an owner exists",
  new URL(stranger.url()).pathname === "/admin/login",
  stranger.url(),
);
await stranger.goto(BASE + "/", { waitUntil: "networkidle" });
check(
  "the front door is the name picker now, not setup",
  new URL(stranger.url()).pathname === "/",
  stranger.url(),
);

// ---------- And the owner can hire from a standing start ----------
await page.goto(BASE + "/admin/employees", { waitUntil: "networkidle" });
const form = page.locator("form").filter({ hasText: "Add employee" });
await form.locator('input[name="name"]').fill("Pete");
await form.locator('input[name="initials"]').fill("pt");
await form.locator('input[name="pin"]').fill("704192");
await form.getByRole("button", { name: "Add employee" }).click();
await page.waitForTimeout(1000);
check("owner can add the first employee", /Pete added/i.test((await page.textContent("body")) ?? ""));

await stranger.goto(BASE + "/", { waitUntil: "networkidle" });
check(
  "the new employee can be picked on the sign-in screen",
  ((await stranger.textContent("body")) ?? "").includes("Pete"),
);

console.log(`\n${pass.length} passed, ${fail.length} failed`);
if (fail.length) console.log("Failures:\n  " + fail.join("\n  "));
await browser.close();
process.exit(fail.length ? 1 : 0);
