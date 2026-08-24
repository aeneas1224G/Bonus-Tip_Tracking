/**
 * The real 8/10/26 - 8/23/26 pay period, transcribed from the shop's
 * Google Sheet. These are the numbers the owner already trusts, so the
 * engine is held against them.
 */
import type { CalcDay, RentalTier, ReviewTier } from "@/lib/calc";

export const PETE = "pete";
export const TAYLOR = "taylor";
export const EVIE = "evie";
export const KYLE = "kyle";
export const JONAH = "jonah";

export const RENTAL_TIERS: RentalTier[] = [
  { minRentals: 10, bonusCents: 1_000 },
  { minRentals: 20, bonusCents: 3_000 },
  { minRentals: 30, bonusCents: 5_000 },
  { minRentals: 40, bonusCents: 10_000 },
  { minRentals: 50, bonusCents: 15_000 },
  { minRentals: 60, bonusCents: 20_000 },
  { minRentals: 70, bonusCents: 26_000 },
  { minRentals: 80, bonusCents: 32_000 },
  { minRentals: 90, bonusCents: 40_000 },
  { minRentals: 100, bonusCents: 50_000 },
  { minRentals: 110, bonusCents: 60_000 },
  { minRentals: 120, bonusCents: 70_000 },
  { minRentals: 130, bonusCents: 80_000 },
];

export const REVIEW_TIERS: ReviewTier[] = [
  { minReviews: 0, perReviewCents: 300 },
  { minReviews: 75, perReviewCents: 400 },
  { minReviews: 100, perReviewCents: 500 },
  { minReviews: 150, perReviewCents: 700 },
];

/** rentals -> bonus, straight off the sheet's tier table, all 14 days. */
export const DAILY_RENTALS_AND_BONUS: Array<[string, number | null, number]> = [
  ["2026-08-10", 49, 10_000],
  ["2026-08-11", 55, 15_000],
  ["2026-08-12", 69, 20_000],
  ["2026-08-13", 60, 20_000],
  ["2026-08-14", 86, 32_000],
  ["2026-08-15", null, 0], // shop closed, "x" in the sheet
  ["2026-08-16", 54, 15_000],
  ["2026-08-17", 64, 20_000],
  ["2026-08-18", 58, 15_000],
  ["2026-08-19", 42, 10_000],
  ["2026-08-20", 57, 15_000],
  ["2026-08-21", 72, 26_000],
  ["2026-08-22", 106, 50_000],
  ["2026-08-23", 84, 32_000],
];

/** Period totals from the sheet's own summary table. */
export const SHEET_HOURS: Record<string, number> = {
  [PETE]: 181,
  [TAYLOR]: 135,
  [EVIE]: 117,
  [KYLE]: 129,
  [JONAH]: 15,
};

export const SHEET_TOTAL_HOURS = 577;
export const SHEET_TIP_TOTAL_CENTS = 294_700; // $2,947 as the sheet reported it
export const SHEET_REVIEW_START = 1887; // 8/10 reading
export const SHEET_REVIEW_END = 1941; // 8/23 reading

/**
 * Build the period. Hours are attached to the first open day because the
 * engine divides period-wide, so the day they sit on does not affect payout —
 * only the period total does. Day-level distribution is exercised separately.
 */
export function buildAugustPeriod(options?: {
  tips?: Array<{ date: string; userId: string; amountCents: number }>;
}): CalcDay[] {
  return DAILY_RENTALS_AND_BONUS.map(([date, rentalCount], index) => ({
    date,
    rentalCount,
    closed: rentalCount === null,
    reviewCount:
      date === "2026-08-10"
        ? SHEET_REVIEW_START
        : date === "2026-08-23"
          ? SHEET_REVIEW_END
          : null,
    entries:
      index === 0
        ? Object.entries(SHEET_HOURS).map(([userId, hours]) => ({
            userId,
            minutes: hours * 60,
          }))
        : [],
    tips: (options?.tips ?? [])
      .filter((tip) => tip.date === date)
      .map(({ userId, amountCents }) => ({ userId, amountCents })),
  }));
}
