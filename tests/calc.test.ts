import { describe, expect, it } from "vitest";
import { calculatePeriod, rentalBonusCents, reviewRateCents, reviewsEarned } from "@/lib/calc";
import { allocateByWeight, formatCents, parseDollarsToCents, parseHoursToMinutes } from "@/lib/money";
import {
  buildAugustPeriod,
  DAILY_RENTALS_AND_BONUS,
  EVIE,
  JONAH,
  KYLE,
  PETE,
  RENTAL_TIERS,
  REVIEW_TIERS,
  SHEET_REVIEW_END,
  SHEET_REVIEW_START,
  SHEET_TIP_TOTAL_CENTS,
  SHEET_TOTAL_HOURS,
  TAYLOR,
} from "./fixtures/august2026";

const base = { rentalTiers: RENTAL_TIERS, reviewTiers: REVIEW_TIERS, reviewBaseline: null };

describe("rental bonus tier ladder", () => {
  it("reproduces every day of the 8/10-8/23 sheet", () => {
    for (const [date, rentals, expected] of DAILY_RENTALS_AND_BONUS) {
      if (rentals === null) continue;
      expect(rentalBonusCents(rentals, RENTAL_TIERS), `${date} (${rentals} rentals)`).toBe(expected);
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

describe("reviews earned", () => {
  it("gets 54 from the sheet's 1887 -> 1941", () => {
    const result = calculatePeriod({ ...base, days: buildAugustPeriod() });
    expect(result.reviewsInPeriod).toBe(SHEET_REVIEW_END - SHEET_REVIEW_START);
    expect(result.reviewsInPeriod).toBe(54);
    expect(result.reviewPoolCents).toBe(16_200); // 54 x $3 = $162
  });

  it("prefers the previous period's closing count over the period's own first reading", () => {
    const days = buildAugustPeriod();
    const withBaseline = reviewsEarned(days, 1_880);
    expect(withBaseline.count).toBe(SHEET_REVIEW_END - 1_880);
  });

  it("never returns a negative bonus when the count goes backward", () => {
    const days = buildAugustPeriod();
    const result = reviewsEarned(days, 5_000);
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

describe("period payout — parity with the spreadsheet", () => {
  it("sums the daily pools to $2,800", () => {
    const result = calculatePeriod({ ...base, days: buildAugustPeriod() });
    expect(result.tipPoolCents).toBe(280_000);
  });

  it("totals 577 hours, matching the sheet", () => {
    const result = calculatePeriod({ ...base, days: buildAugustPeriod() });
    expect(result.totalMinutes / 60).toBe(SHEET_TOTAL_HOURS);
  });

  it("reproduces the sheet's whole-dollar payouts when given the sheet's own $2,947 pool", () => {
    // The sheet folded $147 of cash tips into the pool. Feeding that same pool
    // in must reproduce the sheet's published per-person dollars exactly.
    const shares = allocateByWeight(
      SHEET_TIP_TOTAL_CENTS,
      Object.entries({ [PETE]: 181, [TAYLOR]: 135, [EVIE]: 117, [KYLE]: 129, [JONAH]: 15 }).map(
        ([key, hours]) => ({ key, weight: hours * 60 }),
      ),
    );
    const toDollars = (cents: number) => Math.round(cents / 100);

    expect(toDollars(shares.get(PETE)!)).toBe(924);
    expect(toDollars(shares.get(TAYLOR)!)).toBe(690);
    expect(toDollars(shares.get(EVIE)!)).toBe(598);
    expect(toDollars(shares.get(KYLE)!)).toBe(659);
    expect(toDollars(shares.get(JONAH)!)).toBe(77);
  });

  it("reports the sheet's $5.11/hr rate for that same pool", () => {
    const perHour = Math.round((SHEET_TIP_TOTAL_CENTS * 60) / (SHEET_TOTAL_HOURS * 60));
    expect(formatCents(perHour)).toBe("$5.11");
  });

  it("allocates every cent of both pools, with nothing lost to rounding", () => {
    const result = calculatePeriod({ ...base, days: buildAugustPeriod() });
    const tips = result.employees.reduce((s, e) => s + e.tipShareCents, 0);
    const reviews = result.employees.reduce((s, e) => s + e.reviewShareCents, 0);
    expect(tips).toBe(result.tipPoolCents);
    expect(reviews).toBe(result.reviewPoolCents);
  });

  it("gives each person their proportional share within one cent", () => {
    const result = calculatePeriod({ ...base, days: buildAugustPeriod() });
    for (const employee of result.employees) {
      const exact = (result.tipPoolCents * employee.minutes) / result.totalMinutes;
      expect(Math.abs(employee.tipShareCents - exact)).toBeLessThanOrEqual(1);
    }
  });
});

describe("individual cash tips", () => {
  it("pays 100% to the earner and never dilutes the shared pool", () => {
    const days = buildAugustPeriod({
      tips: [{ date: "2026-08-11", userId: JONAH, amountCents: 4_200 }],
    });
    const result = calculatePeriod({ ...base, days });

    const withTip = result.employees.find((e) => e.userId === JONAH)!;
    const without = calculatePeriod({ ...base, days: buildAugustPeriod() }).employees.find(
      (e) => e.userId === JONAH,
    )!;

    expect(result.tipPoolCents).toBe(280_000);
    expect(withTip.individualTipCents).toBe(4_200);
    expect(withTip.tipShareCents).toBe(without.tipShareCents);
    expect(withTip.totalCents).toBe(without.totalCents + 4_200);
  });

  it("pays a tip to someone who logged no hours this period", () => {
    const days = buildAugustPeriod({
      tips: [{ date: "2026-08-11", userId: "brecklyn", amountCents: 5_100 }],
    });
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
  });

  it("flags rentals recorded with nobody on the clock", () => {
    const days = buildAugustPeriod().map((day) => ({ ...day, entries: [] }));
    const result = calculatePeriod({ ...base, days });
    expect(result.warnings.some((w) => w.code === "RENTALS_WITHOUT_HOURS")).toBe(true);
  });

  it("holds the pools rather than dividing by zero hours", () => {
    const days = buildAugustPeriod().map((day) => ({ ...day, entries: [] }));
    const result = calculatePeriod({ ...base, days });
    expect(result.tipPoolCents).toBe(280_000);
    expect(result.employees).toHaveLength(0);
    expect(result.warnings.some((w) => w.code === "NO_HOURS_IN_PERIOD")).toBe(true);
  });

  it("earns nothing on a closed day", () => {
    const result = calculatePeriod({ ...base, days: buildAugustPeriod() });
    const closed = result.days.find((d) => d.date === "2026-08-15")!;
    expect(closed.closed).toBe(true);
    expect(closed.poolCents).toBe(0);
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
    const shares = allocateByWeight(50_000, [{ key: "a", weight: 0 }]);
    expect(shares.get("a")).toBe(0);
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
    expect(formatCents(294_700)).toBe("$2,947.00");
    expect(formatCents(511)).toBe("$5.11");
    expect(formatCents(0)).toBe("$0.00");
  });
});
