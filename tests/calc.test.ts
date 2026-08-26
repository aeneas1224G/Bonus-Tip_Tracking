import { describe, expect, it } from "vitest";
import { calculatePeriod, rentalBonusCents, reviewRateCents, reviewsEarned } from "@/lib/calc";
import { allocateByWeight, formatCents, parseDollarsToCents, parseHoursToMinutes } from "@/lib/money";
import {
  buildAugustPeriod,
  cleanCells,
  EVIE,
  JONAH,
  KYLE,
  PETE,
  RENTAL_TIERS,
  REVIEW_TIERS,
  SHEET,
  SHEET_GRID_HOURS,
  SHEET_POOL_CENTS,
  SHEET_REVIEW_END,
  SHEET_REVIEW_START,
  TAYLOR,
} from "./fixtures/august2026";

const base = { rentalTiers: RENTAL_TIERS, reviewTiers: REVIEW_TIERS, reviewBaseline: null };
const august = () => calculatePeriod({ ...base, days: buildAugustPeriod() });

describe("rental bonus tier ladder", () => {
  it("reproduces the Bonus column for all 14 days", () => {
    for (const day of SHEET) {
      const expected = day.rentalCount === null ? 0 : day.poolCents;
      const actual =
        day.rentalCount === null ? 0 : rentalBonusCents(day.rentalCount, RENTAL_TIERS);
      expect(actual, `${day.date} (${day.rentalCount} rentals)`).toBe(expected);
    }
  });

  it("pays nothing below the first threshold", () => {
    expect(rentalBonusCents(0, RENTAL_TIERS)).toBe(0);
    expect(rentalBonusCents(9, RENTAL_TIERS)).toBe(0);
    expect(rentalBonusCents(10, RENTAL_TIERS)).toBe(1_000);
  });

  it("uses the highest matching tier, not the first", () => {
    expect(rentalBonusCents(1_000, RENTAL_TIERS)).toBe(80_000);
  });
});

describe("review rate ladder", () => {
  it("charges $3/review under 75 — the sheet's 54 reviews", () => {
    expect(reviewRateCents(54, REVIEW_TIERS)).toBe(300);
  });

  it("steps up at each documented threshold", () => {
    expect(reviewRateCents(74, REVIEW_TIERS)).toBe(300);
    expect(reviewRateCents(75, REVIEW_TIERS)).toBe(400);
    expect(reviewRateCents(99, REVIEW_TIERS)).toBe(400);
    expect(reviewRateCents(100, REVIEW_TIERS)).toBe(500);
    expect(reviewRateCents(149, REVIEW_TIERS)).toBe(500);
    expect(reviewRateCents(150, REVIEW_TIERS)).toBe(700);
  });
});

describe("day-by-day split — parity with the spreadsheet, cell by cell", () => {
  it("computes every cell as the exact pro-rata share, to the cent", () => {
    const result = august();

    for (const day of SHEET) {
      const breakdown = result.days.find((d) => d.date === day.date)!;
      const totalHours = Object.values(day.hours).reduce((sum, h) => sum + h, 0);

      for (const [userId, hours] of Object.entries(day.hours)) {
        const share = breakdown.shares.find((s) => s.userId === userId)!.shareCents;
        const exact = (day.poolCents * hours) / totalHours;
        // Within a cent: largest-remainder can move a single cent to make the
        // day's shares sum to the pool exactly.
        expect(Math.abs(share - exact), `${day.date} ${userId}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("agrees with the sheet's untipped cells to within its hand-rounding", () => {
    const result = august();
    const cells = cleanCells();
    expect(cells.length).toBeGreaterThan(15); // guard against the fixture emptying out

    // The sheet rounds each cell to whole dollars by hand and does it
    // inconsistently — on 8/11 Pete's $65.22 was written down as $65 while
    // Kyle's $39.13 was written up as $40. So a dollar of slack is the sheet's
    // imprecision, not the engine's. The exactness test above is the strict one.
    let exactMatches = 0;
    for (const cell of cells) {
      const day = result.days.find((d) => d.date === cell.date)!;
      const cents = day.shares.find((s) => s.userId === cell.userId)?.shareCents ?? 0;
      expect(Math.abs(cents - cell.cents), `${cell.date} ${cell.userId}`).toBeLessThanOrEqual(
        100,
      );
      if (Math.round(cents / 100) === Math.round(cell.cents / 100)) exactMatches += 1;
    }

    // The overwhelming majority land on the sheet's exact dollar figure.
    expect(exactMatches / cells.length).toBeGreaterThan(0.9);
  });

  it("reconstructs the tipped cells once the cash tip is added back", () => {
    const result = august();

    for (const day of SHEET) {
      for (const [userId, tipCents] of Object.entries(day.tips ?? {})) {
        const breakdown = result.days.find((d) => d.date === day.date)!;
        const share = breakdown.shares.find((s) => s.userId === userId)!.shareCents;
        const reconstructed = share + tipCents;
        // Within a dollar — the sheet's own cells are rounded by hand.
        expect(
          Math.abs(reconstructed - day.sheetCents[userId]),
          `${day.date} ${userId}: ${reconstructed} vs sheet ${day.sheetCents[userId]}`,
        ).toBeLessThanOrEqual(100);
      }
    }
  });

  it("pays out exactly the sum of the daily pools, $2,800", () => {
    const result = august();
    expect(result.tipPoolCents).toBe(SHEET_POOL_CENTS);
    const paid = result.employees.reduce((sum, e) => sum + e.tipShareCents, 0);
    expect(paid).toBe(SHEET_POOL_CENTS);
  });

  it("allocates each day's pool to exactly that day's pool", () => {
    for (const day of august().days) {
      const allocated = day.shares.reduce((sum, s) => sum + s.shareCents, 0);
      expect(allocated, day.date).toBe(day.poolCents);
    }
  });

  it("carries the grid hours through unchanged", () => {
    const result = august();
    for (const [userId, hours] of Object.entries(SHEET_GRID_HOURS)) {
      const employee = result.employees.find((e) => e.userId === userId)!;
      expect(employee.minutes / 60, userId).toBe(hours);
    }
    expect(result.totalMinutes / 60).toBe(262);
  });

  it("pays a busy day at a higher rate than a slow one", () => {
    const days = august().days;
    const busy = days.find((d) => d.date === "2026-08-22")!; // 106 rentals
    const slow = days.find((d) => d.date === "2026-08-10")!; // 49 rentals
    expect(busy.ratePerHourCents).toBe(2_500); // $25.00/hr
    expect(slow.ratePerHourCents).toBe(476); // $4.76/hr
    expect(busy.ratePerHourCents).toBeGreaterThan(slow.ratePerHourCents);
  });

  it("pays nobody for hours on a closed day", () => {
    const closed = august().days.find((d) => d.date === "2026-08-15")!;
    expect(closed.closed).toBe(true);
    expect(closed.poolCents).toBe(0);
    expect(closed.minutes).toBe(4 * 60); // Evie and Taylor each logged 2 hours
    expect(closed.shares.every((s) => s.shareCents === 0)).toBe(true);
  });

  it("does not let closed-day hours dilute the other days", () => {
    // Removing the closed day's hours must not change anyone's tip share,
    // because that day had no pool to divide in the first place.
    const withClosed = august();
    const withoutClosed = calculatePeriod({
      ...base,
      days: buildAugustPeriod().map((day) =>
        day.date === "2026-08-15" ? { ...day, entries: [] } : day,
      ),
    });
    for (const employee of withClosed.employees) {
      const other = withoutClosed.employees.find((e) => e.userId === employee.userId)!;
      expect(employee.tipShareCents, employee.userId).toBe(other.tipShareCents);
    }
  });

  it("gives Pete the whole pool on the day he worked alone", () => {
    const solo = august().days.find((d) => d.date === "2026-08-21")!;
    expect(solo.shares).toHaveLength(1);
    expect(solo.shares[0].userId).toBe(PETE);
    expect(solo.shares[0].shareCents).toBe(26_000);
  });
});

describe("reviews", () => {
  it("gets 54 from the sheet's 1887 -> 1941, worth $162", () => {
    const result = august();
    expect(result.reviewsInPeriod).toBe(SHEET_REVIEW_END - SHEET_REVIEW_START);
    expect(result.reviewsInPeriod).toBe(54);
    expect(result.reviewPoolCents).toBe(16_200);
  });

  it("splits the review pool across the whole period, not day by day", () => {
    const result = august();
    const allocated = result.employees.reduce((sum, e) => sum + e.reviewShareCents, 0);
    expect(allocated).toBe(result.reviewPoolCents);

    // Proportional to period hours, unlike the tip share.
    for (const employee of result.employees) {
      const exact = (result.reviewPoolCents * employee.minutes) / result.totalMinutes;
      expect(Math.abs(employee.reviewShareCents - exact)).toBeLessThanOrEqual(1);
    }
  });

  it("prefers the previous period's closing count over the period's own first reading", () => {
    expect(reviewsEarned(buildAugustPeriod(), 1_880).count).toBe(SHEET_REVIEW_END - 1_880);
  });

  it("never returns a negative bonus when the count goes backward", () => {
    const result = reviewsEarned(buildAugustPeriod(), 5_000);
    expect(result.count).toBe(0);
    expect(result.warnings[0].code).toBe("REVIEW_COUNT_WENT_BACKWARD");
  });

  it("holds at zero when no reading exists — the sheet's -$1,944 bug", () => {
    const days = buildAugustPeriod().map((day) => ({ ...day, reviewCount: null }));
    const result = calculatePeriod({ ...base, days, reviewBaseline: 1_944 });
    expect(result.reviewPoolCents).toBe(0);
    expect(result.warnings.some((w) => w.code === "NO_REVIEW_READING")).toBe(true);
  });
});

describe("individual cash tips", () => {
  it("pays 100% to the earner and never dilutes any day's pool", () => {
    const withTips = august();
    const withoutTips = calculatePeriod({
      ...base,
      days: buildAugustPeriod({ includeTips: false }),
    });

    expect(withTips.tipPoolCents).toBe(withoutTips.tipPoolCents);
    for (const employee of withTips.employees) {
      const bare = withoutTips.employees.find((e) => e.userId === employee.userId)!;
      expect(employee.tipShareCents, employee.userId).toBe(bare.tipShareCents);
      expect(employee.totalCents).toBe(bare.totalCents + employee.individualTipCents);
    }
  });

  it("totals the $357 of cash tips the sheet's notes account for", () => {
    // $25 per rescue plus the water amounts written in the Notes column.
    const total = august().employees.reduce((sum, e) => sum + e.individualTipCents, 0);
    expect(total).toBe(35_700);
  });

  it("pays a tip to someone who logged no hours this period", () => {
    const days = buildAugustPeriod();
    days[1].tips.push({ userId: "brecklyn", amountCents: 5_100 });
    const result = calculatePeriod({ ...base, days });
    const brecklyn = result.employees.find((e) => e.userId === "brecklyn")!;
    expect(brecklyn.minutes).toBe(0);
    expect(brecklyn.tipShareCents).toBe(0);
    expect(brecklyn.totalCents).toBe(5_100);
  });
});

describe("guard rails", () => {
  it("flags a day with hours but no rental count", () => {
    const days = buildAugustPeriod().map((day) =>
      day.date === "2026-08-10" ? { ...day, rentalCount: null } : day,
    );
    const result = calculatePeriod({ ...base, days });
    expect(result.warnings.some((w) => w.code === "HOURS_WITHOUT_RENTALS")).toBe(true);
    // And that day genuinely pays nobody, which is why the warning matters.
    const day = result.days.find((d) => d.date === "2026-08-10")!;
    expect(day.poolCents).toBe(0);
  });

  it("flags a pool that would go unpaid because nobody logged hours", () => {
    const days = buildAugustPeriod({ includeTips: false }).map((day) => ({
      ...day,
      entries: [],
    }));
    const result = calculatePeriod({ ...base, days });
    expect(result.warnings.some((w) => w.code === "RENTALS_WITHOUT_HOURS")).toBe(true);
    expect(result.employees).toHaveLength(0);
    expect(result.warnings.some((w) => w.code === "NO_HOURS_IN_PERIOD")).toBe(true);
  });

  it("still credits a cash tip when nobody logged hours that period", () => {
    const days = buildAugustPeriod().map((day) => ({ ...day, entries: [] }));
    const result = calculatePeriod({ ...base, days });
    // Nobody earns a pool share, but the tips they were handed are still theirs.
    expect(result.employees.every((e) => e.tipShareCents === 0)).toBe(true);
    expect(result.employees.reduce((s, e) => s + e.individualTipCents, 0)).toBe(35_700);
  });
});

describe("the lock guard's condition", () => {
  // lockPeriod refuses on exactly this shape, so pin down how the engine
  // reports it. If this changes, the guard silently stops guarding.
  const unpaidDays = (result: ReturnType<typeof calculatePeriod>) =>
    result.days.filter((day) => !day.closed && day.rentalCount === null && day.minutes > 0);

  it("finds nothing to block on a complete period", () => {
    expect(unpaidDays(august())).toHaveLength(0);
  });

  it("catches a day where hours were logged but the rental count never was", () => {
    const days = buildAugustPeriod().map((day) =>
      day.date === "2026-08-14" ? { ...day, rentalCount: null } : day,
    );
    const result = calculatePeriod({ ...base, days });
    const blocked = unpaidDays(result);

    expect(blocked).toHaveLength(1);
    expect(blocked[0].date).toBe("2026-08-14");
    expect(blocked[0].staffCount).toBe(3);
    expect(blocked[0].minutes / 60).toBe(27);
    // Three people would silently earn nothing for a day they worked.
    expect(blocked[0].shares.every((share) => share.shareCents === 0)).toBe(true);
  });

  it("does not block on a closed day, which is meant to pay nothing", () => {
    // 8/15 has 4 hours logged and no rental count, but it is marked closed.
    expect(august().days.find((d) => d.date === "2026-08-15")!.closed).toBe(true);
    expect(unpaidDays(august())).toHaveLength(0);
  });

  it("does not block on a day nobody worked", () => {
    const days = buildAugustPeriod().map((day) =>
      day.date === "2026-08-14" ? { ...day, rentalCount: null, entries: [] } : day,
    );
    expect(unpaidDays(calculatePeriod({ ...base, days }))).toHaveLength(0);
  });
});

describe("allocateByWeight", () => {
  it("splits an indivisible pool without losing a cent", () => {
    const shares = allocateByWeight(10_000, [
      { key: "a", weight: 1 },
      { key: "b", weight: 1 },
      { key: "c", weight: 1 },
    ]);
    const values = [...shares.values()].sort();
    expect(values).toEqual([3_333, 3_333, 3_334]);
    expect(values.reduce((a, b) => a + b, 0)).toBe(10_000);
  });

  it("is deterministic across runs", () => {
    const input = [
      { key: "a", weight: 100 },
      { key: "b", weight: 100 },
      { key: "c", weight: 100 },
    ];
    expect([...allocateByWeight(1_001, input)]).toEqual([...allocateByWeight(1_001, input)]);
  });

  it("returns all zeros when nobody worked", () => {
    expect(allocateByWeight(50_000, [{ key: "a", weight: 0 }]).get("a")).toBe(0);
  });
});

describe("input parsing", () => {
  it("accepts decimal and clock-style hours", () => {
    expect(parseHoursToMinutes("10")).toBe(600);
    expect(parseHoursToMinutes("10.5")).toBe(630);
    expect(parseHoursToMinutes("7:30")).toBe(450);
    expect(parseHoursToMinutes("")).toBeNull();
    expect(parseHoursToMinutes("-3")).toBeNull();
    expect(parseHoursToMinutes("abc")).toBeNull();
  });

  it("accepts dollar amounts with symbols and commas", () => {
    expect(parseDollarsToCents("25")).toBe(2_500);
    expect(parseDollarsToCents("$25.50")).toBe(2_550);
    expect(parseDollarsToCents("1,200")).toBe(120_000);
    expect(parseDollarsToCents("12.345")).toBeNull();
  });

  it("formats cents back to dollars", () => {
    expect(formatCents(280_000)).toBe("$2,800.00");
    expect(formatCents(476)).toBe("$4.76");
    expect(formatCents(0)).toBe("$0.00");
  });
});
