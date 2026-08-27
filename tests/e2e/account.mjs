/**
 * The Account page: changing the password, and the lockout message.
 *
 * Setup: seeded database, server on :3100 (see smoke.mjs header).
 *   node tests/e2e/account.mjs
 *
 * Run it against a freshly seeded database — it changes the owner's
 * username and password, so running two suites back to back without
 * reseeding will fail on sign-in, not on anything real.
 *
 * Needs psql on PATH and DB pointing at the same database the server uses.
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const DB = process.env.DB ?? "postgresql://postgres@127.0.0.1:55432/vtb";
const USER = process.env.ADMIN_USERNAME ?? "admin";
const START_PW = process.env.ADMIN_PASSWORD ?? "localtest1234";
const NEW_PW = "a-brand-new-long-password";

// execFile, not a shell — bcrypt hashes are full of $ and a shell eats them.
const sql = (q) => execFileSync("psql", [DB, "-c", q], { encoding: "utf8" }).trim();

const pass = [], fail = [];
const check = (n, ok, d = "") => {
  (ok ? pass : fail).push(n);
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
};

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

async function signIn(username, password) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(BASE + "/admin/login", { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => new URL(u).pathname === "/admin", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  return { page, ok: new URL(page.url()).pathname === "/admin", body: (await page.textContent("body")) ?? "" };
}

// ---------- The lockout that started all this ----------
sql(`UPDATE "User" SET "lockedUntil" = now() + interval '15 minutes' WHERE "role"::text = 'ADMIN';`);

let r = await signIn(USER, START_PW);
check("a locked account still refuses the correct password", !r.ok);
check("but now it SAYS the password was correct", /password is correct/i.test(r.body));
check("and how long the wait is", /\d+ more minute/i.test(r.body));
await r.page.context().close();

// A wrong password during a lockout must not reveal the lockout exists.
r = await signIn(USER, "definitely-not-the-password");
check("a wrong password during a lockout reveals nothing", !/password is correct|locked/i.test(r.body));
check("...it looks like an ordinary failure", /Username or password is not right/i.test(r.body));
await r.page.context().close();

sql(`UPDATE "User" SET "failedAttempts" = 0, "lockedUntil" = NULL WHERE "role"::text = 'ADMIN';`);

// ---------- Changing the password ----------
r = await signIn(USER, START_PW);
check("signs in once unlocked", r.ok);
const page = r.page;

const change = async (current, next, confirm) => {
  await page.goto(BASE + "/admin/account", { waitUntil: "networkidle" });
  const form = page.locator("form").filter({ hasText: "Change password" });
  await form.locator('input[name="currentPassword"]').fill(current);
  await form.locator('input[name="newPassword"]').fill(next);
  await form.locator('input[name="confirmPassword"]').fill(confirm);
  await form.getByRole("button", { name: "Change password" }).click();
  await page.waitForTimeout(1100);
  return (await page.textContent("body")) ?? "";
};

check("wrong current password refused",
  /current password is not right/i.test(await change("wrong-one-entirely", NEW_PW, NEW_PW)));
check("short new password refused",
  /at least 12 characters/i.test(await change(START_PW, "tooshort", "tooshort")));
check("mismatched confirmation refused",
  /do not match/i.test(await change(START_PW, NEW_PW, "something-else-long")));
check("reusing the same password refused",
  /already have/i.test(await change(START_PW, START_PW, START_PW)));

// Still the old password after all those failures.
r = await signIn(USER, START_PW);
check("nothing changed while inputs were invalid", r.ok);
await r.page.context().close();

check("the real change succeeds", /Password changed/i.test(await change(START_PW, NEW_PW, NEW_PW)));

// ---------- Confirm it took ----------
r = await signIn(USER, NEW_PW);
check("signs in with the new password", r.ok);
await r.page.context().close();

r = await signIn(USER, START_PW);
check("the old password stops working", !r.ok);
await r.page.context().close();

check("still signed in on the original tab",
  new URL(page.url()).pathname === "/admin/account");

// ---------- Form typos must not use up the attempt budget ----------
// This is what broke first time round: validation mistakes counted as attempts,
// so fumbling the form repeatedly locked the real owner out of their own
// account -- the precise failure this whole page exists to prevent.
for (let i = 0; i < 8; i += 1) {
  await change(NEW_PW, "tooshort", "tooshort");
}
const afterTypos = await change(NEW_PW, "a-fresh-long-password", "a-fresh-long-password");
check("eight form typos do not block a valid change", /Password changed/i.test(afterTypos));

r = await signIn(USER, "a-fresh-long-password");
check("and that change really took", r.ok);
await r.page.context().close();

// ---------- Changing the password clears a lockout ----------
sql(`UPDATE "User" SET "lockedUntil" = now() + interval '15 minutes' WHERE "role"::text = 'ADMIN';`);
await change("a-fresh-long-password", "final-long-password-here", "final-long-password-here");
r = await signIn(USER, "final-long-password-here");
check("changing the password also clears the lockout", r.ok);
await r.page.context().close();

console.log(`\n${pass.length} passed, ${fail.length} failed`);
if (fail.length) console.log("Failures:\n  " + fail.join("\n  "));
await browser.close();
process.exit(fail.length ? 1 : 0);
