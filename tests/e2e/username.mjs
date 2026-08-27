/**
 * Changing the owner's sign-in name to an email address.
 *
 * Setup: seeded database, server on :3100 (see smoke.mjs header).
 *   node tests/e2e/username.mjs
 *
 * Run it against a freshly seeded database — it changes the owner's
 * username and password, so running two suites back to back without
 * reseeding will fail on sign-in, not on anything real.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const START_USER = process.env.ADMIN_USERNAME ?? "admin";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "localtest1234";
const NEW_EMAIL = "Admin@VistaTrailBikes.COM"; // deliberately mixed case

const pass = [], fail = [];
const check = (name, ok, detail = "") => {
  (ok ? pass : fail).push(name);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

async function signIn(page, username, password) {
  await page.goto(BASE + "/admin/login", { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => new URL(u).pathname === "/admin", { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(400);
  return new URL(page.url()).pathname === "/admin";
}

// ---------- Sign in with the original name ----------
const ctx = await browser.newContext();
const page = await ctx.newPage();
check("signs in with the original username", await signIn(page, START_USER, PASSWORD));

// ---------- The Account page is reachable ----------
await page.goto(BASE + "/admin", { waitUntil: "networkidle" });
check("Account link is in the admin header", (await page.getByRole("link", { name: "Account" }).count()) > 0);
await page.goto(BASE + "/admin/account", { waitUntil: "networkidle" });
check("account page shows the current name", ((await page.textContent("body")) ?? "").includes(START_USER));

const change = async (username, password) => {
  await page.goto(BASE + "/admin/account", { waitUntil: "networkidle" });
  // Scope to the sign-in-name form: the password form on the same page also
  // has a "current password" field, so a bare selector matches both.
  const form = page.locator("form").filter({ hasText: "Change sign-in name" });
  await form.locator('input[name="username"]').fill(username);
  await form.locator('input[name="currentPassword"]').fill(password);
  await form.getByRole("button", { name: /Change sign-in name/i }).click();
  await page.waitForTimeout(1100);
  return (await page.textContent("body")) ?? "";
};

// ---------- It refuses without the right password ----------
check("wrong password refused", /password is not right/i.test(await change("someone@else.com", "not-my-password")));

// ---------- It refuses a malformed email ----------
check("malformed email refused", /complete email address/i.test(await change("admin@vistatrailbikes", PASSWORD)));
check("name with a space refused", /letters, numbers/i.test(await change("the owner", PASSWORD)));

// ---------- Still the old name after all that ----------
await page.goto(BASE + "/admin/account", { waitUntil: "networkidle" });
check("nothing changed while inputs were invalid", ((await page.textContent("body")) ?? "").includes(START_USER));

// ---------- The real change ----------
const result = await change(NEW_EMAIL, PASSWORD);
check("email accepted", /Sign in with/i.test(result), result.slice(0, 0));
check("stored lowercased", result.includes("admin@vistatrailbikes.com"));

// ---------- Sign in with the new address ----------
const fresh = await browser.newContext();
const relog = await fresh.newPage();
check("signs in with the new email", await signIn(relog, "admin@vistatrailbikes.com", PASSWORD));

// ---------- Capitals still get you in ----------
const caps = await (await browser.newContext()).newPage();
check("capitals in the email still sign in", await signIn(caps, "ADMIN@VISTATRAILBIKES.COM", PASSWORD));

// ---------- The old name no longer works ----------
const old = await (await browser.newContext()).newPage();
check("the old username stops working", !(await signIn(old, START_USER, PASSWORD)));

// ---------- The password is untouched ----------
const wrongPw = await (await browser.newContext()).newPage();
check("a wrong password is still refused", !(await signIn(wrongPw, "admin@vistatrailbikes.com", "wrong-password-here")));

console.log(`\n${pass.length} passed, ${fail.length} failed`);
if (fail.length) console.log("Failures:\n  " + fail.join("\n  "));
await browser.close();
process.exit(fail.length ? 1 : 0);
