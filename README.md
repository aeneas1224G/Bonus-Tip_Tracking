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

**3. The daily pool is split day by day.** Each day's pool goes to only the people
who worked *that day*, in proportion to their hours, and those daily shares are
summed across the period. A busy Saturday pays far more per hour than a slow Monday
— 8/22/26 paid $25.00/hr while 8/10/26 paid $4.76/hr — so you are paid for the days
you were actually there. Hours on a closed day earn nothing and dilute nobody.

**3b. The review bonus is split period-wide**, because reviews are counted across the
whole period and there is no single day to attribute them to. That one pool is
divided by total period hours.

**4. Cash tips are not pooled.** Water sales and rescue tips are paid entirely to
the person who earned them and never dilute anyone else's share. Rescues are a flat
$25 and get a one-tap button; water amounts are typed in.

Both ladders are editable at **Admin → Bonus rates**. Saving creates a new version
rather than overwriting the old one, so a pay period you have already locked keeps
the rates it was actually paid at.

### Parity with the spreadsheet

The sheet's daily money column decodes exactly as *that day's pool split by that
day's hours, plus that person's own cash tips*. The engine reconstructs it cell by
cell, and `tests/calc.test.ts` asserts every one of those cells rather than a
summary total. Across the 8/10–8/23 period the engine produces $3,319 against the
$3,316 the sheet paid — a $3 gap that comes entirely from the sheet rounding its own
cells by hand, inconsistently (on 8/11 Pete's $65.22 was written down to $65 while
Kyle's $39.13 was written up to $40).

Per person, the daily column agrees within about a dollar. What is left over is the
review bonus, where the sheet's hours column was demonstrably wrong: it credited
Taylor 135 hours and Kyle 129 against the 69 and 46 they actually logged, and its
own column summed to 482 while the cell above it said 497.

### Other fixes

- **A second, unused calculation is gone.** The sheet carried a right-hand summary
  block ($2,947 across 577 hours at $5.11/hr) that produced different numbers from
  the ones actually paid and was never used. There is now one calculation.
- **Cash tips no longer inflate the shared pool.** The sheet folded cash tips into
  the pot, so everyone's share moved when one person sold a bottle of water.
- **The review bonus can no longer go negative.** The sheet's current period showed
  `-$1,944` because it subtracted the period's own first review reading and the last
  one was blank. The app measures from the *previous* period's closing count, clamps
  at zero, and warns instead of paying a negative number.
- **Rounding cannot lose or invent cents.** Shares are allocated by the
  largest-remainder method, so they always sum to exactly the pool.

## Roles and sign-in

- **Owner** signs in with a username and password. Full add / edit / delete, can edit
  any day in an open period, sets PINs, edits rates, locks periods, exports to Gusto.
- **Employees** tap their name and enter a 6-digit PIN. They log their own hours and
  cash tips, and can fill in the day's shared numbers (rentals, review count).
- **Everyone sees everything.** Any signed-in employee can view the full period sheet,
  including what everyone else earned, matching how the shared spreadsheet worked.

### PIN security

PINs are **6 digits** — a million combinations rather than the ten thousand a
4-digit PIN gives you. The surrounding controls matter as much as the length:

- Five wrong PINs locks that account for 15 minutes. The owner can unlock it instantly.
- A per-IP throttle sits in front of that (10 attempts/minute), so one machine cannot
  rotate through employees to grind the keyspace.
- Guessable PINs are refused at the point they are set: all-same digits (`111111`),
  repeated blocks (`121212`, `123123`) and straight runs (`123456`, `654321`).
- PINs are stored bcrypt-hashed and can never be read back, only replaced.
- Every sign-in, failed attempt, and money-affecting change is written to an
  append-only audit log.

PIN length lives in one place — `PIN_LENGTH` in `src/lib/pin.ts`. The login pad,
both admin forms, every validator and the seed script read from it, so changing
the length again is a one-line edit.

> **If PINs were already issued before this change**, they no longer work — a hash
> cannot be lengthened. Reissue each one under Admin → Employees.

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

Which calendar day an entry lands on is decided by `SHOP_TIMEZONE`, set to
`America/Los_Angeles`, not by the server's clock.

Locking is refused while any day has hours logged but no rental count — under
day-by-day splitting that would silently pay everyone who worked that day $0.

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
