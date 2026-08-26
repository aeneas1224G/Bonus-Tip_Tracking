/**
 * Pay periods are 14 days, Monday -> Sunday, anchored on 2026-08-10 —
 * the first day of the earliest period in the source spreadsheet.
 *
 * Dates are handled as UTC midnight throughout so the shop, which is on
 * Pacific time, never sees a shift land in the wrong period because of a
 * timezone offset. Which calendar day an entry belongs to is decided by
 * SHOP_TIMEZONE, not by the server's clock.
 */

export const PERIOD_LENGTH_DAYS = 14;
export const PERIOD_ANCHOR = "2026-08-10"; // a Monday

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse "YYYY-MM-DD" into a UTC-midnight Date. */
export function parseISODate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Invalid ISO date: ${iso}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

/** Render a Date as "YYYY-MM-DD" using its UTC fields. */
export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export type PeriodBounds = {
  /** Whole number of periods since the anchor. Negative before the anchor. */
  index: number;
  startDate: string;
  endDate: string;
};

/** The pay period containing `date`. */
export function periodForDate(date: Date | string): PeriodBounds {
  const target = typeof date === "string" ? parseISODate(date) : date;
  const anchor = parseISODate(PERIOD_ANCHOR);

  // Math.floor (not trunc) so dates before the anchor land in the period
  // that contains them rather than snapping forward.
  const index = Math.floor(daysBetween(anchor, target) / PERIOD_LENGTH_DAYS);
  return periodByIndex(index);
}

export function periodByIndex(index: number): PeriodBounds {
  const anchor = parseISODate(PERIOD_ANCHOR);
  const start = addDays(anchor, index * PERIOD_LENGTH_DAYS);
  const end = addDays(start, PERIOD_LENGTH_DAYS - 1);
  return { index, startDate: toISODate(start), endDate: toISODate(end) };
}

/** Every date in the period, in order. Always 14 entries. */
export function datesInPeriod(bounds: Pick<PeriodBounds, "startDate">): string[] {
  const start = parseISODate(bounds.startDate);
  return Array.from({ length: PERIOD_LENGTH_DAYS }, (_, offset) =>
    toISODate(addDays(start, offset)),
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function weekdayLabel(iso: string): string {
  return WEEKDAYS[parseISODate(iso).getUTCDay()];
}

/** "8/10/26" — matches how the spreadsheet reads. */
export function shortDateLabel(iso: string): string {
  const date = parseISODate(iso);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${String(date.getUTCFullYear()).slice(2)}`;
}

export function periodLabel(bounds: Pick<PeriodBounds, "startDate" | "endDate">): string {
  return `${shortDateLabel(bounds.startDate)} – ${shortDateLabel(bounds.endDate)}`;
}

/** Today's date in the shop's timezone, as an ISO date string. */
export function todayISO(
  timeZone = process.env.SHOP_TIMEZONE ?? "America/Los_Angeles",
): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}
