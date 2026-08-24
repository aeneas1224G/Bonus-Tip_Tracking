import "server-only";

import { db } from "./db";
import { calculatePeriod, type CalcResult, type RentalTier, type ReviewTier } from "./calc";
import {
  datesInPeriod,
  parseISODate,
  periodForDate,
  toISODate,
  todayISO,
  type PeriodBounds,
} from "./payPeriod";

export type PeriodWithPayout = {
  period: {
    id: string;
    startDate: string;
    endDate: string;
    status: "OPEN" | "LOCKED";
    lockedAt: Date | null;
  };
  result: CalcResult;
  employeeNames: Map<string, string>;
  /** Present only on a locked period: the numbers exactly as they were paid. */
  snapshot: CalcResult | null;
};

/**
 * Two employees hitting the app at the same moment on a fresh day both find
 * nothing and both try to create it. Postgres rejects the loser on the unique
 * index; that is the correct outcome, so we catch it and read back the row the
 * winner made rather than surfacing a crash.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/** Find or create the PayPeriod row covering a date, plus its 14 DayRecords. */
export async function ensurePeriod(dateISO: string) {
  const bounds = periodForDate(dateISO);
  const startDate = parseISODate(bounds.startDate);

  const existing = await db.payPeriod.findUnique({ where: { startDate } });
  if (existing) return existing;

  const currentSchedule = await db.rateSchedule.findFirst({ where: { isCurrent: true } });

  try {
    return await db.payPeriod.create({
      data: {
        startDate,
        endDate: parseISODate(bounds.endDate),
        rateScheduleId: currentSchedule?.id ?? null,
        days: {
          create: datesInPeriod(bounds).map((iso) => ({ date: parseISODate(iso) })),
        },
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await db.payPeriod.findUnique({ where: { startDate } });
      if (raced) return raced;
    }
    throw error;
  }
}

export async function ensureDay(dateISO: string) {
  const date = parseISODate(dateISO);

  const existing = await db.dayRecord.findUnique({ where: { date } });
  if (existing) return existing;

  const period = await ensurePeriod(dateISO);

  try {
    return await db.dayRecord.create({ data: { date, payPeriodId: period.id } });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await db.dayRecord.findUnique({ where: { date } });
      if (raced) return raced;
    }
    throw error;
  }
}

/**
 * The rate schedule a period should be costed at: the one pinned to it if
 * present, otherwise whichever schedule is current. Pinning at lock time is
 * what stops a later rate change from rewriting an already-paid period.
 */
async function ratesForPeriod(rateScheduleId: string | null) {
  const schedule = rateScheduleId
    ? await db.rateSchedule.findUnique({
        where: { id: rateScheduleId },
        include: { rentalTiers: true, reviewTiers: true },
      })
    : await db.rateSchedule.findFirst({
        where: { isCurrent: true },
        include: { rentalTiers: true, reviewTiers: true },
      });

  const rentalTiers: RentalTier[] = (schedule?.rentalTiers ?? []).map((tier) => ({
    minRentals: tier.minRentals,
    bonusCents: tier.bonusCents,
  }));
  const reviewTiers: ReviewTier[] = (schedule?.reviewTiers ?? []).map((tier) => ({
    minReviews: tier.minReviews,
    perReviewCents: tier.perReviewCents,
  }));

  return { schedule, rentalTiers, reviewTiers };
}

/**
 * The cumulative review count as of the end of the previous period — the
 * baseline the review gain is measured from.
 */
async function reviewBaselineBefore(startDateISO: string): Promise<number | null> {
  const previous = await db.dayRecord.findFirst({
    where: { date: { lt: parseISODate(startDateISO) }, reviewCount: { not: null } },
    orderBy: { date: "desc" },
    select: { reviewCount: true },
  });
  return previous?.reviewCount ?? null;
}

export async function loadPeriod(bounds: PeriodBounds): Promise<PeriodWithPayout> {
  const period = await ensurePeriod(bounds.startDate);

  const days = await db.dayRecord.findMany({
    where: { payPeriodId: period.id },
    orderBy: { date: "asc" },
    include: {
      entries: { include: { user: { select: { id: true, name: true } } } },
      tips: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  const { rentalTiers, reviewTiers } = await ratesForPeriod(period.rateScheduleId);
  const reviewBaseline = await reviewBaselineBefore(bounds.startDate);

  const result = calculatePeriod({
    days: days.map((day) => ({
      date: toISODate(day.date),
      rentalCount: day.rentalCount,
      closed: day.closed,
      reviewCount: day.reviewCount,
      entries: day.entries.map((entry) => ({ userId: entry.userId, minutes: entry.minutes })),
      tips: day.tips.map((tip) => ({ userId: tip.userId, amountCents: tip.amountCents })),
    })),
    rentalTiers,
    reviewTiers,
    reviewBaseline,
  });

  const employeeNames = new Map<string, string>();
  for (const day of days) {
    for (const entry of day.entries) employeeNames.set(entry.user.id, entry.user.name);
    for (const tip of day.tips) employeeNames.set(tip.user.id, tip.user.name);
  }

  return {
    period: {
      id: period.id,
      startDate: toISODate(period.startDate),
      endDate: toISODate(period.endDate),
      status: period.status,
      lockedAt: period.lockedAt,
    },
    result,
    employeeNames,
    snapshot: (period.lockedSnapshot as CalcResult | null) ?? null,
  };
}

export function currentPeriod(): PeriodBounds {
  return periodForDate(todayISO());
}

/** Periods that already have a row, newest first, for the period switcher. */
export async function listPeriods() {
  const periods = await db.payPeriod.findMany({ orderBy: { startDate: "desc" } });
  return periods.map((period) => ({
    id: period.id,
    startDate: toISODate(period.startDate),
    endDate: toISODate(period.endDate),
    status: period.status,
  }));
}
