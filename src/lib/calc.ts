/**
 * The payout engine.
 *
 * This module is pure: no database, no clock, no I/O. Everything the payout
 * depends on is passed in, so the rules can be tested against the numbers the
 * shop already trusts from its spreadsheet.
 *
 * The rules, as confirmed with the owner:
 *
 *   1. Each open day earns a POOL from a tier ladder keyed on rentals that day
 *      (40+ rentals = $100, 50+ = $150, ...). Closed days earn nothing.
 *   2. Those daily pools are summed across the whole two-week period, then
 *      divided by TOTAL HOURS worked in the period, then multiplied by each
 *      employee's hours. Not day by day — period-wide.
 *   3. The review bonus works the same way. New Google reviews earned during
 *      the period are multiplied by a per-review rate that is itself tiered on
 *      the period's review count, giving a second pool split by the same hours.
 *   4. Individual cash tips (water sales, rescues) are paid 100% to the person
 *      who earned them and never enter either pool.
 */

import { allocateByWeight, MINUTES_PER_HOUR } from "./money";

export type RentalTier = { minRentals: number; bonusCents: number };
export type ReviewTier = { minReviews: number; perReviewCents: number };

export type CalcDay = {
  date: string;
  rentalCount: number | null;
  closed: boolean;
  reviewCount: number | null;
  entries: Array<{ userId: string; minutes: number }>;
  tips: Array<{ userId: string; amountCents: number }>;
};

export type CalcInput = {
  days: CalcDay[];
  rentalTiers: RentalTier[];
  reviewTiers: ReviewTier[];
  /**
   * Cumulative lifetime review count as of the END of the previous pay period.
   * Null when no earlier reading exists, in which case the first reading inside
   * this period becomes the baseline (which is how the spreadsheet did it).
   */
  reviewBaseline: number | null;
};

export type EmployeePayout = {
  userId: string;
  minutes: number;
  tipShareCents: number;
  reviewShareCents: number;
  individualTipCents: number;
  totalCents: number;
};

export type DayBreakdown = {
  date: string;
  rentalCount: number | null;
  closed: boolean;
  poolCents: number;
  minutes: number;
  staffCount: number;
};

export type CalcWarning = {
  code:
    | "HOURS_WITHOUT_RENTALS"
    | "RENTALS_WITHOUT_HOURS"
    | "NO_REVIEW_READING"
    | "REVIEW_COUNT_WENT_BACKWARD"
    | "NO_HOURS_IN_PERIOD";
  date?: string;
  message: string;
};

export type CalcResult = {
  tipPoolCents: number;
  reviewsInPeriod: number;
  reviewRateCents: number;
  reviewPoolCents: number;
  totalPoolCents: number;
  totalMinutes: number;
  /** Display-only derived rates, rounded to the cent. */
  tipRatePerHourCents: number;
  reviewRatePerHourCents: number;
  employees: EmployeePayout[];
  days: DayBreakdown[];
  warnings: CalcWarning[];
};

/**
 * Highest tier whose threshold the count reaches. Below every threshold the
 * value is zero — 9 rentals earns nothing, same as the spreadsheet.
 */
export function rentalBonusCents(rentalCount: number, tiers: RentalTier[]): number {
  let best = 0;
  let bestMin = -1;
  for (const tier of tiers) {
    if (rentalCount >= tier.minRentals && tier.minRentals > bestMin) {
      best = tier.bonusCents;
      bestMin = tier.minRentals;
    }
  }
  return best;
}

export function reviewRateCents(reviewCount: number, tiers: ReviewTier[]): number {
  let best = 0;
  let bestMin = -1;
  for (const tier of tiers) {
    if (reviewCount >= tier.minReviews && tier.minReviews > bestMin) {
      best = tier.perReviewCents;
      bestMin = tier.minReviews;
    }
  }
  return best;
}

/**
 * New reviews earned during the period.
 *
 * Review counts are cumulative lifetime totals, so the gain is a subtraction.
 * The spreadsheet subtracted the period's own first reading, which silently
 * dropped day one's reviews and produced a -$1,944 bonus on any period whose
 * last reading was blank. Preferring the previous period's closing reading
 * fixes both, and the result is clamped at zero so a mistyped count can never
 * generate a negative bonus.
 */
export function reviewsEarned(
  days: CalcDay[],
  baseline: number | null,
): { count: number; warnings: CalcWarning[] } {
  const warnings: CalcWarning[] = [];
  const readings = days
    .filter((day): day is CalcDay & { reviewCount: number } => day.reviewCount !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (readings.length === 0) {
    warnings.push({
      code: "NO_REVIEW_READING",
      message: "No Google review count was recorded in this period, so the review bonus is $0.",
    });
    return { count: 0, warnings };
  }

  const latest = readings[readings.length - 1].reviewCount;
  const effectiveBaseline = baseline ?? readings[0].reviewCount;
  const raw = latest - effectiveBaseline;

  if (raw < 0) {
    warnings.push({
      code: "REVIEW_COUNT_WENT_BACKWARD",
      message:
        `Review count dropped from ${effectiveBaseline} to ${latest}. ` +
        `That is almost certainly a typo — the review bonus is being held at $0 until it is corrected.`,
    });
    return { count: 0, warnings };
  }

  return { count: raw, warnings };
}

export function calculatePeriod(input: CalcInput): CalcResult {
  const { days, rentalTiers, reviewTiers, reviewBaseline } = input;
  const warnings: CalcWarning[] = [];

  // --- Pool 1: daily rental bonuses, summed across the period ------------
  let tipPoolCents = 0;
  const dayBreakdowns: DayBreakdown[] = [];

  for (const day of days) {
    const minutes = day.entries.reduce((sum, entry) => sum + entry.minutes, 0);
    const poolCents =
      day.closed || day.rentalCount === null
        ? 0
        : rentalBonusCents(day.rentalCount, rentalTiers);

    tipPoolCents += poolCents;

    if (!day.closed && day.rentalCount === null && minutes > 0) {
      warnings.push({
        code: "HOURS_WITHOUT_RENTALS",
        date: day.date,
        message: `${day.date}: hours were logged but no rental count was entered, so this day contributes $0 to the pool.`,
      });
    }
    if (!day.closed && day.rentalCount !== null && day.rentalCount > 0 && minutes === 0) {
      warnings.push({
        code: "RENTALS_WITHOUT_HOURS",
        date: day.date,
        message: `${day.date}: ${day.rentalCount} rentals were recorded but nobody logged hours.`,
      });
    }

    dayBreakdowns.push({
      date: day.date,
      rentalCount: day.rentalCount,
      closed: day.closed,
      poolCents,
      minutes,
      staffCount: day.entries.filter((entry) => entry.minutes > 0).length,
    });
  }

  // --- Pool 2: review bonus ----------------------------------------------
  const reviews = reviewsEarned(days, reviewBaseline);
  warnings.push(...reviews.warnings);
  const perReviewCents = reviewRateCents(reviews.count, reviewTiers);
  const reviewPoolCents = reviews.count * perReviewCents;

  // --- Hours, which are the divisor for both pools ------------------------
  const minutesByUser = new Map<string, number>();
  for (const day of days) {
    for (const entry of day.entries) {
      minutesByUser.set(entry.userId, (minutesByUser.get(entry.userId) ?? 0) + entry.minutes);
    }
  }

  const tipsByUser = new Map<string, number>();
  for (const day of days) {
    for (const tip of day.tips) {
      tipsByUser.set(tip.userId, (tipsByUser.get(tip.userId) ?? 0) + tip.amountCents);
      if (!minutesByUser.has(tip.userId)) minutesByUser.set(tip.userId, 0);
    }
  }

  const totalMinutes = [...minutesByUser.values()].reduce((sum, m) => sum + m, 0);

  if (totalMinutes === 0 && tipPoolCents + reviewPoolCents > 0) {
    warnings.push({
      code: "NO_HOURS_IN_PERIOD",
      message:
        "No hours are logged for this period, so there is nothing to divide the pools by. " +
        "Both pools are held until hours are entered.",
    });
  }

  const weights = [...minutesByUser.entries()].map(([userId, minutes]) => ({
    key: userId,
    weight: minutes,
  }));

  const tipShares = allocateByWeight(tipPoolCents, weights);
  const reviewShares = allocateByWeight(reviewPoolCents, weights);

  const employees: EmployeePayout[] = weights
    .map(({ key: userId, weight: minutes }) => {
      const tipShareCents = tipShares.get(userId) ?? 0;
      const reviewShareCents = reviewShares.get(userId) ?? 0;
      const individualTipCents = tipsByUser.get(userId) ?? 0;
      return {
        userId,
        minutes,
        tipShareCents,
        reviewShareCents,
        individualTipCents,
        totalCents: tipShareCents + reviewShareCents + individualTipCents,
      };
    })
    .sort((a, b) => b.totalCents - a.totalCents || a.userId.localeCompare(b.userId));

  const perHour = (poolCents: number) =>
    totalMinutes === 0 ? 0 : Math.round((poolCents * MINUTES_PER_HOUR) / totalMinutes);

  return {
    tipPoolCents,
    reviewsInPeriod: reviews.count,
    reviewRateCents: perReviewCents,
    reviewPoolCents,
    totalPoolCents: tipPoolCents + reviewPoolCents,
    totalMinutes,
    tipRatePerHourCents: perHour(tipPoolCents),
    reviewRatePerHourCents: perHour(reviewPoolCents),
    employees,
    days: dayBreakdowns,
    warnings,
  };
}
