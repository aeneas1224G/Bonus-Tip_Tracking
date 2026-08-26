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
 *   2. Each day's pool is split among ONLY THE PEOPLE WHO WORKED THAT DAY, in
 *      proportion to their hours, and those daily shares are summed across the
 *      period. Day by day, not period-wide — you are paid for the days you were
 *      actually there, so a busy Saturday pays more per hour than a slow Monday.
 *   3. The review bonus is different, because reviews are counted per period
 *      rather than per day. New Google reviews earned during the period are
 *      multiplied by a per-review rate that is itself tiered on the period's
 *      review count, and that single pool is split across the period's total
 *      hours.
 *   4. Individual cash tips (water sales, rescues) are paid 100% to the person
 *      who earned them and never enter either pool.
 *
 * Rule 2 is verified cell by cell against the owner's spreadsheet in
 * tests/calc.test.ts — the daily shares reconstruct its daily grid exactly.
 */

import { allocateByWeight, MINUTES_PER_HOUR } from "./money";

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

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

export type DayShare = {
  userId: string;
  minutes: number;
  shareCents: number;
};

export type DayBreakdown = {
  date: string;
  rentalCount: number | null;
  closed: boolean;
  poolCents: number;
  minutes: number;
  staffCount: number;
  /** What this day paid per hour. Varies day to day — that is the point. */
  ratePerHourCents: number;
  shares: DayShare[];
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
  /**
   * Display-only. The tip figure is the period AVERAGE across every day —
   * useful as a headline, but no individual day paid exactly this rate.
   */
  averageTipRatePerHourCents: number;
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

  // --- Pool 1: each day's bonus, split among that day's crew ---------------
  //
  // The split happens per day, so someone who worked only the slow days does
  // not ride on a Saturday they were not there for. Each day is allocated by
  // largest remainder, so every day's shares sum to exactly that day's pool,
  // and therefore the period total is exact too.
  let tipPoolCents = 0;
  const dayBreakdowns: DayBreakdown[] = [];
  const tipShareByUser = new Map<string, number>();

  for (const day of days) {
    const minutes = day.entries.reduce((sum, entry) => sum + entry.minutes, 0);
    const poolCents =
      day.closed || day.rentalCount === null
        ? 0
        : rentalBonusCents(day.rentalCount, rentalTiers);

    tipPoolCents += poolCents;

    const working = day.entries.filter((entry) => entry.minutes > 0);
    const allocation = allocateByWeight(
      poolCents,
      working.map((entry) => ({ key: entry.userId, weight: entry.minutes })),
    );

    const shares: DayShare[] = working.map((entry) => {
      const shareCents = allocation.get(entry.userId) ?? 0;
      tipShareByUser.set(entry.userId, (tipShareByUser.get(entry.userId) ?? 0) + shareCents);
      return { userId: entry.userId, minutes: entry.minutes, shareCents };
    });

    if (!day.closed && day.rentalCount === null && minutes > 0) {
      warnings.push({
        code: "HOURS_WITHOUT_RENTALS",
        date: day.date,
        message: `${day.date}: hours were logged but no rental count was entered, so everyone who worked that day earns $0 for it.`,
      });
    }
    if (!day.closed && day.rentalCount !== null && day.rentalCount > 0 && minutes === 0) {
      warnings.push({
        code: "RENTALS_WITHOUT_HOURS",
        date: day.date,
        message: `${day.date}: ${day.rentalCount} rentals were recorded but nobody logged hours, so this day's ${formatDollars(poolCents)} pool goes unpaid.`,
      });
    }

    dayBreakdowns.push({
      date: day.date,
      rentalCount: day.rentalCount,
      closed: day.closed,
      poolCents,
      minutes,
      staffCount: working.length,
      ratePerHourCents:
        minutes === 0 ? 0 : Math.round((poolCents * MINUTES_PER_HOUR) / minutes),
      shares,
    });
  }

  // --- Pool 2: review bonus, which is a period figure ---------------------
  //
  // Reviews are counted across the whole period rather than per day, so there
  // is no day to attribute them to. This one pool is split by period hours.
  const reviews = reviewsEarned(days, reviewBaseline);
  warnings.push(...reviews.warnings);
  const perReviewCents = reviewRateCents(reviews.count, reviewTiers);
  const reviewPoolCents = reviews.count * perReviewCents;

  // --- Hours, and anyone who earned a tip without logging a shift ---------
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

  const reviewShares = allocateByWeight(reviewPoolCents, weights);

  const employees: EmployeePayout[] = weights
    .map(({ key: userId, weight: minutes }) => {
      const tipShareCents = tipShareByUser.get(userId) ?? 0;
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
    averageTipRatePerHourCents: perHour(tipPoolCents),
    reviewRatePerHourCents: perHour(reviewPoolCents),
    employees,
    days: dayBreakdowns,
    warnings,
  };
}
