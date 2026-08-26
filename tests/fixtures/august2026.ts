/**
 * The real 8/10/26 - 8/23/26 pay period, transcribed cell by cell from the
 * shop's Google Sheet (exported as CSV so the columns align exactly).
 *
 * The sheet's daily money column turns out to be:
 *
 *     that day's pool, split among that day's crew by hours,
 *     plus that person's own cash tips
 *
 * so these fixtures let the engine be checked against individual cells rather
 * than against a summary total.
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

export type SheetDay = {
  date: string;
  /** null = the "x" rows, where the shop was shut. */
  rentalCount: number | null;
  /** The Bonus column, in cents. */
  poolCents: number;
  /** Hours as typed in the grid, per person. */
  hours: Record<string, number>;
  /** The dollar figure the sheet shows next to those hours, in cents. */
  sheetCents: Record<string, number>;
  /**
   * Individual cash tips inside that dollar figure, from the Notes column.
   * Rescues are a flat $25; water amounts are written out in the notes.
   */
  tips?: Record<string, number>;
};

export const SHEET: SheetDay[] = [
  {
    date: "2026-08-10",
    rentalCount: 49,
    poolCents: 10_000,
    hours: { [JONAH]: 8, [EVIE]: 3, [KYLE]: 10 },
    sheetCents: { [JONAH]: 5_200, [EVIE]: 3_900, [KYLE]: 4_800 },
    // "evie rescue, Jonah water $14"
    tips: { [EVIE]: 2_500, [JONAH]: 1_400 },
  },
  {
    date: "2026-08-11",
    rentalCount: 55,
    poolCents: 15_000,
    hours: { [JONAH]: 7, [PETE]: 10, [KYLE]: 6 },
    sheetCents: { [JONAH]: 8_700, [PETE]: 6_500, [KYLE]: 4_000 },
    // "jonah water $42."
    tips: { [JONAH]: 4_200 },
  },
  {
    date: "2026-08-12",
    rentalCount: 69,
    poolCents: 20_000,
    hours: { [PETE]: 10, [KYLE]: 10 },
    sheetCents: { [PETE]: 10_000, [KYLE]: 10_000 },
  },
  {
    date: "2026-08-13",
    rentalCount: 60,
    poolCents: 20_000,
    hours: { [PETE]: 10, [TAYLOR]: 10 },
    sheetCents: { [PETE]: 12_500, [TAYLOR]: 12_500 },
    // Unnoted, but exactly one $25 rescue each.
    tips: { [PETE]: 2_500, [TAYLOR]: 2_500 },
  },
  {
    date: "2026-08-14",
    rentalCount: 86,
    poolCents: 32_000,
    hours: { [EVIE]: 7, [PETE]: 10, [TAYLOR]: 10 },
    sheetCents: { [EVIE]: 8_300, [PETE]: 11_900, [TAYLOR]: 11_900 },
  },
  {
    date: "2026-08-15",
    rentalCount: null, // "x" — shop closed
    poolCents: 0,
    hours: { [EVIE]: 2, [TAYLOR]: 2 },
    sheetCents: { [EVIE]: 0, [TAYLOR]: 0 },
  },
  {
    date: "2026-08-16",
    rentalCount: 54,
    poolCents: 15_000,
    hours: { [EVIE]: 10, [TAYLOR]: 10 },
    sheetCents: { [EVIE]: 7_500, [TAYLOR]: 7_500 },
  },
  {
    date: "2026-08-17",
    rentalCount: 64,
    poolCents: 20_000,
    hours: { [EVIE]: 10, [KYLE]: 10 },
    sheetCents: { [EVIE]: 12_500, [KYLE]: 17_500 },
    // "Kyle 3x Rescue, evie 1x rescue" — $25 each, exactly.
    tips: { [EVIE]: 2_500, [KYLE]: 7_500 },
  },
  {
    date: "2026-08-18",
    rentalCount: 58,
    poolCents: 15_000,
    hours: { [PETE]: 10, [TAYLOR]: 10 },
    sheetCents: { [PETE]: 10_000, [TAYLOR]: 7_500 },
    tips: { [PETE]: 2_500 },
  },
  {
    date: "2026-08-19",
    rentalCount: 42,
    poolCents: 10_000,
    hours: { [PETE]: 10, [TAYLOR]: 8 },
    sheetCents: { [PETE]: 8_100, [TAYLOR]: 12_100 },
    // "taylor rescue x1, also got water- $51, rescue pt"
    tips: { [PETE]: 2_500, [TAYLOR]: 7_600 },
  },
  {
    date: "2026-08-20",
    rentalCount: 57,
    poolCents: 15_000,
    hours: { [PETE]: 10, [TAYLOR]: 9 },
    sheetCents: { [PETE]: 7_900, [TAYLOR]: 7_100 },
  },
  {
    date: "2026-08-21",
    rentalCount: 72,
    poolCents: 26_000,
    hours: { [PETE]: 10 },
    sheetCents: { [PETE]: 26_000 },
  },
  {
    date: "2026-08-22",
    rentalCount: 106,
    poolCents: 50_000,
    hours: { [EVIE]: 10, [TAYLOR]: 10 },
    sheetCents: { [EVIE]: 25_000, [TAYLOR]: 25_000 },
  },
  {
    date: "2026-08-23",
    rentalCount: 84,
    poolCents: 32_000,
    hours: { [EVIE]: 10, [KYLE]: 10 },
    sheetCents: { [EVIE]: 16_000, [KYLE]: 16_000 },
  },
];

/** Sum of the Bonus column: $2,800. */
export const SHEET_POOL_CENTS = 280_000;

/** Hours as they appear in the daily grid. */
export const SHEET_GRID_HOURS: Record<string, number> = {
  [PETE]: 80,
  [TAYLOR]: 69,
  [EVIE]: 52,
  [KYLE]: 46,
  [JONAH]: 15,
};

export const SHEET_REVIEW_START = 1887; // 8/10 reading
export const SHEET_REVIEW_END = 1941; // 8/23 reading

/**
 * Days where the sheet's dollar figure carries no individual tip, so the
 * engine's share must equal it to the dollar.
 */
export function cleanCells(): Array<{ date: string; userId: string; cents: number }> {
  const cells: Array<{ date: string; userId: string; cents: number }> = [];
  for (const day of SHEET) {
    for (const [userId, cents] of Object.entries(day.sheetCents)) {
      if (!day.tips?.[userId]) cells.push({ date: day.date, userId, cents });
    }
  }
  return cells;
}

export function buildAugustPeriod(options?: { includeTips?: boolean }): CalcDay[] {
  return SHEET.map((day) => ({
    date: day.date,
    rentalCount: day.rentalCount,
    closed: day.rentalCount === null,
    reviewCount:
      day.date === "2026-08-10"
        ? SHEET_REVIEW_START
        : day.date === "2026-08-23"
          ? SHEET_REVIEW_END
          : null,
    entries: Object.entries(day.hours).map(([userId, hours]) => ({
      userId,
      minutes: Math.round(hours * 60),
    })),
    tips:
      options?.includeTips === false
        ? []
        : Object.entries(day.tips ?? {}).map(([userId, amountCents]) => ({
            userId,
            amountCents,
          })),
  }));
}
