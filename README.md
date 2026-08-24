# Vista Trail Bikes — Bonus & Tip Tracking

Replaces the two-tab Google Sheet the shop uses to track daily bonus pools, review
bonuses and cash tips across each two-week pay period, and to produce the totals
that go into Gusto at payroll time.

## How the money works

Everything the app shows is derived from entries. No total is ever stored — change
a day and every number recalculates.

**1. Daily bonus pool.** Each open day earns a pool based on how many bikes were
rented that day:

| Rentals | Pool | Rentals | Pool |
| ------- | ---- | ------- | ---- |
| 10+ | $10 | 70+ | $260 |
| 20+ | $30 | 80+ | $320 |
| 30+ | $50 | 90+ | $400 |
| 40+ | $100 | 100+ | $500 |
| 50+ | $150 | 110+ | $600 |
| 60+ | $200 | 120+ | $700 |
|  |  | 130+ | $800 |

Below 10 rentals a day earns nothing, and a day marked closed earns nothing.

**2. Review bonus.** New Google reviews earned during the period are paid at a rate
that depends on how many the period earned: under 75 → $3 each, 75–99 → $4,
100–149 → $5, 150+ → $7.

**3. Both pools are split by hours, period-wide.** Sum the pools for the whole two
weeks, divide by total hours worked in those two weeks, multiply by each person's
hours. Not day by day.

**4. Cash tips are not pooled.** Water sales and rescue tips are paid entirely to
the person who earned them and never dilute anyone else's share.

Both ladders are editable at **Admin → Bonus rates**. Saving creates a new version
rather than overwriting the old one, so a pay period you have already locked keeps
the rates it was actually paid at.

### Differences from the spreadsheet

The sheet calculated payouts two ways that disagreed by $212 for the 8/10–8/23
period. The app uses the period-wide hourly proration (the sheet's own right-hand
summary table), which always reconciles to the penny. Fed the sheet's own $2,947
pool and 577 hours, it reproduces the sheet's published dollars exactly — Pete $924,
Taylor $690, Evie $598, Kyle $659, Jonah $77. That parity is asserted in
`tests/calc.test.ts`.

Three other fixes:

- **Cash tips no longer inflate the shared pool.** The sheet folded $147 of water
  and rescue money into the $2,947 pot, so everyone's share moved when one person
  sold a bottle of water.
- **The review bonus can no longer go negative.** The sheet's current period showed
  `-$1,944` because it subtracted the period's own first review reading and the last
  one was blank. The app measures from the *previous* period's closing count, clamps
  at zero, and warns instead of paying a negative number.
- **Rounding cannot lose or invent cents.** Shares are allocated by the
  largest-remainder method, so they always sum to exactly the pool.

## Roles and sign-in

- **Owner** signs in with a username and password. Full add / edit / delete, can edit
  any day in an open period, sets PINs, edits rates, locks periods, exports to Gusto.
- **Employees** tap their name and enter a 4-digit PIN. They log their own hours and
  cash tips, and can fill in the day's shared numbers (rentals, review count).
- **Everyone sees everything.** Any signed-in employee can view the full period sheet,
  including what everyone else earned, matching how the shared spreadsheet worked.

### PIN security

A 4-digit PIN is only 10,000 combinations, so the surrounding controls are what
protect it:

- Five wrong PINs locks that account for 15 minutes. The owner can unlock it instantly.
- A per-IP throttle sits in front of that (10 attempts/minute), so one machine cannot
  rotate through employees to walk the keyspace.
- PINs are stored bcrypt-hashed and can never be read back, only replaced.
- Every sign-in, failed attempt, and money-affecting change is written to an
  append-only audit log.

If you later decide you want a shared staff password in front of the PIN pad, that
is a small addition — one gate screen ahead of the name picker. It is not built yet;
say the word and it goes in.

## Edit rules

| Who | What they can change |
| --- | --- |
| Employee | Their own hours and tips, and the day's shared numbers — until midnight that day |
| Owner | Anything, on any day, while the period is open |
| Nobody | Anything in a locked period, until the owner unlocks it |

Locking a period freezes every entry, pins the current bonus rates to it, and stores
a snapshot of exactly what was paid.

## Pay periods

Fourteen days, Monday through Sunday, anchored on **2026-08-10** — the first period
in the spreadsheet. Every period since lines up with it automatically; there is
nothing to roll over by hand.

## Payroll handoff

**Admin → Download payroll CSV** gives one row per employee — hours, tip share,
review bonus, cash tips, total — plus the full derivation and a day-by-day
breakdown so the numbers can be checked without opening the app. Dollar columns are
plain decimals so a spreadsheet reads them as numbers.

A direct Gusto API push is not built yet, but the data model carries a
`gustoEmployeeId` on each employee so it can be added without rework.

## Running it

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL and SESSION_SECRET
npm run db:push               # create the tables
npm run db:seed               # owner account, 2026 rate ladders, staff roster + PINs
npm run dev
```

`db:seed` prints a starter PIN for each employee once. Hand them out, then change
them under Admin → Employees.

Generate a session secret with `openssl rand -base64 32`.

### Deploying to Vercel

1. Create a Postgres database (Neon, Vercel Postgres or Supabase).
2. Set `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` and
   `SHOP_TIMEZONE` in the Vercel project's environment variables.
3. Push. The build runs `prisma generate` automatically.
4. Run `npm run db:push && npm run db:seed` once against the production database.

## Tests

```bash
npm test          # 27 unit tests — the payout engine against the real sheet numbers
npm run typecheck
```

`tests/e2e/smoke.mjs` is a browser test covering sign-in, entry, pool splitting,
role separation, CSV export and locking. It needs a running server and a scratch
database; see the header of that file.

## Layout

```
src/lib/calc.ts        the payout engine — pure, no I/O, fully tested
src/lib/money.ts       integer-cent arithmetic and largest-remainder allocation
src/lib/payPeriod.ts   the two-week calendar, anchored and timezone-safe
src/lib/periods.ts     loads a period out of the database and costs it
src/lib/csv.ts         the Gusto export
src/lib/auth.ts        sessions, PIN and password verification, lockout
src/app/actions/       every write, each one audit-logged
prisma/schema.prisma   money in cents, hours in minutes, never floats
```
