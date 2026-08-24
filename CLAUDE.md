# Vista Trail Bikes — bonus & tip tracking

**Read `HANDOFF.md` first.** It carries the decisions already made with the owner, what
is built, what is not, and the questions still open. `README.md` explains how the app
works and how the money is calculated.

## Non-negotiables

- **Money is integer cents; hours are integer minutes.** Never introduce a float into a
  dollar or an hours value. `src/lib/money.ts` has the helpers.
- **Split pools with `allocateByWeight`**, which uses largest-remainder so allocations
  sum to exactly the pool. Do not hand-roll rounding.
- **Never store a computed total.** Everything derives from entries on read. The one
  exception is `PayPeriod.lockedSnapshot`, frozen at lock time.
- **Never mutate a `RateSchedule`.** Editing rates creates a new version so locked
  periods keep the rates they were paid at.
- **`src/lib/calc.ts` stays pure** — no database, no clock, no I/O. It is the piece that
  is tested against the owner's real spreadsheet numbers, and that parity test must keep
  passing.
- **PIN length is `PIN_LENGTH` in `src/lib/pin.ts`.** Do not hard-code a digit count.
- **Every money-affecting write calls `recordAudit`.** The log is append-only.

## Before you say something works

```bash
npm run typecheck
npm test
```

For anything touching auth, entry or payout, also run `tests/e2e/smoke.mjs` against a
scratch database — see its header. The unit tests will not catch a broken form or a
route that stopped checking the session.

## Stack

Next.js App Router + TypeScript, Prisma + Postgres, Tailwind, server actions for all
mutations, session cookie auth with bcrypt hashes.
