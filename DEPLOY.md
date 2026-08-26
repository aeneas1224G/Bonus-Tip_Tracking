# Putting this online

About fifteen minutes, almost all of it creating two free accounts. You will not
need a terminal, and you will not need to install anything.

You hold every credential. Nothing here asks you to share a password.

---

## 1. Create the database (Neon, free)

1. Go to **neon.tech** and sign up.
2. Create a project. Any name; pick the region closest to the shop.
3. On the project dashboard find the **connection string**. It looks like:

   ```
   postgresql://user:password@ep-something.us-west-2.aws.neon.tech/neondb?sslmode=require
   ```

4. Copy it somewhere for the next step. **This is a password — do not paste it
   into email, chat, or anywhere public.**

## 2. Invent two secrets

You need two random strings. Any password generator works, or mash the keyboard.

- **SESSION_SECRET** — at least 32 characters. Keeps sign-in cookies from being
  forged.
- **SETUP_TOKEN** — at least 8 characters. Used once, on the first screen, to prove
  the person setting up the app is you.

Write both down before you continue.

## 3. Deploy (Vercel, free)

1. Go to **vercel.com** and sign in with GitHub.
2. **Add New → Project**, and import `Bonus-Tip_Tracking`.
3. Set the branch to `claude/employee-bonus-tracking-app-xecoap` (or `main`, once
   this is merged).
4. Before clicking Deploy, open **Environment Variables** and add four:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the Neon connection string from step 1 |
   | `SESSION_SECRET` | your long random string |
   | `SETUP_TOKEN` | your shorter random string |
   | `SHOP_TIMEZONE` | `America/Los_Angeles` |

5. Click **Deploy** and wait a couple of minutes.

The build creates the database tables itself. There is nothing to run by hand.

## 4. Claim the app

1. Open the URL Vercel gives you. It will land on a **setup** page.
2. Enter your `SETUP_TOKEN`, then choose a username and password.

   The password protects payroll — make it long, and not one you use elsewhere.
   There is no "forgot password" link; recovering it means going into the
   database. Put it in a password manager now.

3. You are signed in and looking at the Employees page.

Setup closes permanently the moment that account exists. Nobody can use that page
again, and the token stops working.

## 5. Add your crew

On the Employees page, add Pete, Taylor, Kyle and Evie, giving each a 6-digit PIN.
Tell them their PIN in person — the app stores it hashed and can never show it
again. You can change any PIN later from the same page.

Send staff the plain URL. They tap their name, enter their PIN, and log hours.

---

## After it is live

**Every push updates it.** Vercel rebuilds on each push to the branch, so changes
appear without you doing anything. Pull requests get their own temporary preview
URL, so anything can be looked at before it reaches the real one.

**Cost.** Neon and Vercel both have free tiers this sits inside comfortably. Neon
sleeps an idle database, so the first page load after a quiet spell takes a couple
of seconds.

**Backups.** Neon keeps point-in-time history on the free tier — check the
retention window in their dashboard. Worth knowing where that button is before you
need it.

**A custom address** like `bonus.vistatrailbikes.com` is a DNS record in Vercel's
Domains tab, whenever you want one.

---

## If something goes wrong

**"SETUP_TOKEN is not set on the server"** — the variable is missing or under 8
characters. Add it in Vercel under Settings → Environment Variables, then
**redeploy** — environment changes do not apply to an already-built deployment.

**The build fails on `prisma migrate deploy`** — `DATABASE_URL` is wrong or the
database is unreachable. Check it was pasted whole, including `?sslmode=require`.

**The setup page redirects to sign-in and you never set a password** — an owner
account already exists on that database. If it is not yours, you are pointed at the
wrong database.

**An employee is locked out** — five wrong PINs locks an account for 15 minutes.
Unlock it instantly from Admin → Employees, or set them a new PIN.

**You forget the owner password** — there is no reset link, deliberately. It needs
someone with database access to replace the stored hash. Avoid this: password
manager, today.
