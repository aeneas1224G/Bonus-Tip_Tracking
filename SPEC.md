# Vista Trail Bikes — bonus & tip tracking

A product specification, written so it can be built on any stack. It describes
what the app does and why, not how this particular version is put together.

---

## The problem

Vista Trail Bikes is a bike rental shop. Staff bonuses and tips are tracked in a
shared Google Sheet: one row per day, columns for each employee's hours, a bonus
pool derived from how many bikes went out, and a running Google review count.
Every two weeks the owner totals it up and enters the result into Gusto payroll.

The sheet works, but it has the failure modes spreadsheets always have — two
calculations that disagree, a formula that produced a negative bonus, hand-typed
cells rounded inconsistently. This app replaces it.

**Users:** one owner, four employees (seasonal peak may reach seven or eight).

---

## The money rules

These are the whole point of the app. Everything else is plumbing.

### 1. Each open day earns a bonus pool

Driven by the number of bikes rented that day, on a tier ladder:

| Rentals | Pool | Rentals | Pool |
| ------- | ---- | ------- | ---- |
| 10+ | $10 | 70+ | $260 |
| 20+ | $30 | 80+ | $320 |
| 30+ | $50 | 90+ | $400 |
| 40+ | $100 | 100+ | $500 |
| 50+ | $150 | 110+ | $600 |
| 60+ | $200 | 120+ | $700 |
|  |  | 130+ | $800 |

Below 10 rentals a day earns nothing. A day marked closed earns nothing. The
**highest** matching tier applies, not the first.

### 2. Each day's pool is split among that day's crew, by hours

This is the rule most likely to be got wrong, so state it precisely:

> A day's pool goes **only to the people who worked that day**, in proportion to
> their hours on that day. Those daily shares are then summed across the pay
> period.

It is **not** "sum the pools, divide by total period hours". That averaging
approach gives materially different answers — in the reference period below it
moves one employee $126 and another $77 — and it is not what the shop pays.

The practical effect is that a busy Saturday pays far more per hour than a slow
Monday, and you are paid for the days you were actually there. It also means
hours logged on a closed day earn nothing and dilute nobody.

### 3. The review bonus is a period figure

Staff record the shop's cumulative Google review count at end of day. New reviews
earned during the period are the difference between the last reading in the
period and the last reading of the **previous** period.

That count is multiplied by a per-review rate, itself tiered on how many the
period earned:

| New reviews in period | Rate each |
| --- | --- |
| under 75 | $3 |
| 75–99 | $4 |
| 100–149 | $5 |
| 150+ | $7 |

Unlike the daily pool, this single pool **is** split across total period hours —
reviews accrue over the period and there is no day to attribute them to.

Guard rails that matter: if the count goes backwards (a typo), clamp the bonus to
zero and warn rather than paying a negative. If no reading exists in the period,
pay zero and warn. The original spreadsheet showed a `-$1,944` review bonus
because it did neither.

### 4. Individual cash tips are never pooled

Water sales and trail rescues are paid **100% to the person who earned them**.
They never enter either pool and never dilute anyone else's share.

Rescues are a flat **$25** — worth a one-tap button rather than a typed amount.
Water tips vary and get typed.

### 5. Rounding must not lose or invent money

Allocate every pool with the **largest-remainder method**, so the shares sum to
exactly the pool. Naive rounding leaks cents: three people splitting $100 by
equal hours must come to $33.34 / $33.33 / $33.33, not three times $33.33.

---

## Pay periods

Fourteen days, Monday through Sunday, anchored on **2026-08-10**. Every period
since lines up with it automatically; there is nothing to roll over by hand.

Which calendar day an entry belongs to is decided by the **shop's timezone**
(America/Los_Angeles), not the server's clock. A 9pm entry must land on that day.

A period can be **locked** when payroll is run. Locking freezes every entry,
pins the rate ladders in force at that moment, and stores a snapshot of exactly
what was paid.

**Locking must be refused while any day has hours logged but no rental count.**
Under day-by-day splitting, such a day pays everyone who worked it nothing, and
locking makes that permanent. The refusal should name the days, the hours and how
many people are affected, and point at the two ways out: enter the rentals, or
mark the day closed.

---

## Roles and access

**Owner** — one account, signs in with a username (an email address is fine) and
a password. Full add/edit/delete. Does not work shifts and does not share in the
pool; the server should refuse to attach hours to the owner account, not merely
hide the option.

**Employees** — tap their name on the sign-in screen, then enter a **6-digit
PIN**. No password. They log their own hours and cash tips, and may fill in the
day's shared numbers (rentals, review count) — whoever gets there first.

**Everyone can see everything.** Any signed-in employee can view the full period
sheet, including what everyone else earned. This mirrors how the shared
spreadsheet worked and was an explicit choice, not an oversight.

### Edit window

| Who | What they can change |
| --- | --- |
| Employee | Their own hours and tips, and the day's shared numbers — until local midnight that day |
| Owner | Anything, on any day, while the period is open |
| Nobody | Anything in a locked period, until the owner unlocks it |

### Security notes worth inheriting

A 6-digit PIN is a small keyspace, so the controls around it are what matter:

- Five wrong attempts locks that account for 15 minutes; the owner can unlock it instantly
- A per-device throttle sits in front of that, so one machine cannot rotate through employees
- Guessable PINs are refused when set: all-same digits, repeated blocks (`121212`), straight runs (`123456`)
- PINs and passwords are stored hashed and can never be read back, only replaced

**Two lessons learned the hard way, both worth building in from the start:**

**A locked account must not report "wrong password".** If it does, someone typing
their *correct* password during a lockout cannot tell the difference, and on an
app with no password reset that reads as being locked out permanently. Check the
password even while locked, and reveal the lockout **only when the password was
right** — so a guesser still learns nothing.

**Validation mistakes must not count as failed attempts.** A too-short password
or a mismatched confirmation is a typo, not an attack. Counting them means
fumbling a form five times locks the owner out of the very page meant to prevent
that. Rate-limit genuinely wrong passwords strictly; cap overall throughput
loosely.

### Deliberately not built

**There is no password reset link.** On an app holding payroll, a reset link is a
way in for anyone who reaches the owner's email. The cost is that a lost password
requires direct database access — which makes an in-app *password change* screen
essential, not optional.

---

## Screens

**Sign-in (`/`)** — a grid of employee names. Tap one, enter a PIN on a numeric
pad. A link to owner sign-in.

**Employee entry** — one screen, everything on it:
- Hours worked today (accepts `8`, `7.5`, or `7:30`)
- Today's shared shop numbers: rentals, cumulative review count, ebikes out, who closed, notes, a "shop was closed" toggle
- Their own cash tips, with a one-tap `+ Rescue $25` and a `+ Water sale`
- Their running total for the period, plus today's rate per hour and their share of it

**Period sheet** — visible to everyone. How the pools were built, the payout
table, and a day-by-day table showing each day's rentals, pool, hours and rate
per hour.

**Owner dashboard** — the period sheet plus: a lock button, a CSV export, and a
click-through to edit any single day.

**Day editor (owner)** — the shared numbers, every employee's hours for that day,
and every cash tip.

**Employees (owner)** — add someone with a name and PIN, deactivate, reactivate,
reset a PIN, unlock a locked account. Deactivating removes them from the sign-in
screen while keeping every hour and dollar they earned.

**Bonus rates (owner)** — both ladders and the rescue amount, editable. Saving
creates a **new version** rather than overwriting, so a locked period keeps the
rates it was actually paid at.

**Account (owner)** — change the sign-in name, change the password. Both require
the current password.

**First-run setup** — a fresh deployment has an empty database and no way in. A
setup screen creates the owner account and installs the rate ladders, gated by a
secret set in the hosting environment so nobody can claim the instance first. It
closes permanently once an owner exists.

---

## Data model, in plain terms

- **User** — name, role (owner or employee), active flag, hashed password *or* hashed PIN, failed-attempt count, locked-until timestamp
- **PayPeriod** — start date, end date, status (open or locked), the rate version pinned to it, a frozen snapshot of the payout at lock time
- **DayRecord** — one per calendar day: rental count (nullable — null means "not entered yet", which is different from zero), a closed flag, cumulative review count, ebikes out, who closed, notes
- **ShiftEntry** — one employee's hours for one day, at most one per employee per day
- **IndividualTip** — amount, kind (water / rescue / other), a note, belonging to one employee on one day
- **RateSchedule** — a versioned set of rental tiers, review tiers, and the rescue amount
- **AuditLog** — append-only; every sign-in, failed attempt, and money-affecting write

### Invariants

- **Money is integer cents. Hours are integer minutes.** No float ever touches a dollar or an hours value.
- **Never store a computed total.** Everything derives from entries on read. The one exception is the snapshot frozen at lock time.
- **Never mutate a rate schedule.** Editing creates a new version.
- **A null rental count is not zero.** Null means nobody has entered it; zero means the shop genuinely rented nothing.

---

## Payroll handoff

A CSV export per period: one row per employee with hours, tip share, review
bonus, cash tips and total. Dollar columns as plain decimals so a spreadsheet
reads them as numbers.

Include the derivation — pool totals, review count and rate, total hours — and a
day-by-day breakdown, so the numbers can be audited without opening the app. The
owner keys the result into Gusto.

---

## Reference data for testing

The real 8/10/26 – 8/23/26 pay period. Any implementation should reproduce this.

| Date | Rentals | Pool | Who worked (hours) |
| --- | --- | --- | --- |
| Mon 8/10 | 49 | $100 | Jonah 8, Evie 3, Kyle 10 |
| Tue 8/11 | 55 | $150 | Jonah 7, Pete 10, Kyle 6 |
| Wed 8/12 | 69 | $200 | Pete 10, Kyle 10 |
| Thu 8/13 | 60 | $200 | Pete 10, Taylor 10 |
| Fri 8/14 | 86 | $320 | Evie 7, Pete 10, Taylor 10 |
| Sat 8/15 | closed | $0 | Evie 2, Taylor 2 |
| Sun 8/16 | 54 | $150 | Evie 10, Taylor 10 |
| Mon 8/17 | 64 | $200 | Evie 10, Kyle 10 |
| Tue 8/18 | 58 | $150 | Pete 10, Taylor 10 |
| Wed 8/19 | 42 | $100 | Pete 10, Taylor 8 |
| Thu 8/20 | 57 | $150 | Pete 10, Taylor 9 |
| Fri 8/21 | 72 | $260 | Pete 10 |
| Sat 8/22 | 106 | $500 | Evie 10, Taylor 10 |
| Sun 8/23 | 84 | $320 | Evie 10, Kyle 10 |

Review count: **1887** on 8/10, **1941** on 8/23.

### Expected results

- Daily pools sum to **$2,800**
- Total hours **262** — Pete 80, Taylor 69, Evie 52, Kyle 46, Jonah 15
- New reviews **54**, at $3 each = **$162** review pool
- Tip shares must sum to exactly $2,800; review shares to exactly $162

Individual day checks:

- **8/22** — $500 across 20 hours = $25.00/hr, so Evie and Taylor get $250.00 each
- **8/10** — $100 across 21 hours = $4.76/hr, so Jonah **$38.09**, Evie $14.29, Kyle $47.62.
  This one is the rounding test. Naive rounding gives $38.10 + $14.29 + $47.62 =
  **$100.01**, a cent more than the pool exists. Largest-remainder drops that cent
  from the smallest fractional part, which is Jonah's. If an implementation
  reports $38.10 here, its rounding is inventing money.
- **8/21** — Pete worked alone, so he takes the whole $260.00
- **8/15** — closed, so Evie and Taylor earn $0 for their 2 hours each, and removing those hours entirely must not change anyone else's total

Period tip shares (before cash tips and review bonus): Pete **$853.25**, Taylor
**$734.01**, Evie $682.25, Kyle $446.75, Jonah $83.74 — summing to exactly
$2,800.00.

These are sums of fourteen individually largest-remainder-allocated days, so they
will not match a straight proportional calculation to the cent. That is correct:
each day must balance on its own.

If an implementation instead produces Pete $854.96, Taylor $737.40, Evie $555.73,
Kyle $491.60, Jonah $160.31, it has used period-wide averaging rather than the
day-by-day split.

---

## Out of scope

Not built, and not needed for a first version:

- Direct Gusto API integration — the CSV is the handoff
- Scheduling, shift assignment, or clock in/out — employees type a total
- Anything customer-facing
- Multiple locations
