/**
 * Peak season: the crew grows from four to seven or more, and several of them
 * work the same day. The split has to stay exact no matter how many people are
 * on shift or how awkward their hours are.
 */
import { describe, expect, it } from "vitest";

import { calculatePeriod, type CalcDay } from "@/lib/calc";
import { allocateByWeight } from "@/lib/money";
import { RENTAL_TIERS, REVIEW_TIERS } from "./fixtures/august2026";

const base = { rentalTiers: RENTAL_TIERS, reviewTiers: REVIEW_TIERS, reviewBaseline: null };

function dayWith(crew: Array<{ userId: string; hours: number }>, rentalCount: number): CalcDay {
  return {
    date: "2027-07-05",
    rentalCount,
    closed: false,
    reviewCount: null,
    entries: crew.map((c) => ({ userId: c.userId, minutes: Math.round(c.hours * 60) })),
    tips: [],
  };
}

describe("a bigger crew", () => {
  it("splits a busy day across seven people to the cent", () => {
    // $500 across 7 people and 47.5 hours divides into nothing tidy.
    const crew = [
      { userId: "pete", hours: 8 },
      { userId: "taylor", hours: 7.5 },
      { userId: "kyle", hours: 6 },
      { userId: "evie", hours: 9 },
      { userId: "summer1", hours: 5.25 },
      { userId: "summer2", hours: 6.75 },
      { userId: "summer3", hours: 5 },
    ];
    const result = calculatePeriod({ ...base, days: [dayWith(crew, 106)] });
    const day = result.days[0];

    expect(day.poolCents).toBe(50_000);
    expect(day.shares).toHaveLength(7);
    expect(day.shares.reduce((sum, s) => sum + s.shareCents, 0)).toBe(50_000);

    // Nobody is more than a cent off their exact proportional share.
    const totalMinutes = day.minutes;
    for (const share of day.shares) {
      const exact = (50_000 * share.minutes) / totalMinutes;
      expect(Math.abs(share.shareCents - exact), share.userId).toBeLessThanOrEqual(1);
    }
  });

  it("stays exact for every crew size from 1 to 20", () => {
    for (let size = 1; size <= 20; size += 1) {
      const crew = Array.from({ length: size }, (_, i) => ({
        userId: `staff${i}`,
        // Deliberately awkward: 15-minute increments that rarely divide evenly.
        hours: 4 + (i % 7) * 0.25,
      }));
      const result = calculatePeriod({ ...base, days: [dayWith(crew, 130)] });
      const day = result.days[0];

      expect(day.poolCents, `${size} staff`).toBe(80_000);
      expect(day.shares.reduce((sum, s) => sum + s.shareCents, 0), `${size} staff`).toBe(80_000);
    }
  });

  it("keeps the period total exact when the crew changes mid-period", () => {
    // Four regulars all period, three seasonals joining halfway through.
    const regulars = ["pete", "taylor", "kyle", "evie"];
    const seasonals = ["summer1", "summer2", "summer3"];
    const days: CalcDay[] = Array.from({ length: 14 }, (_, index) => {
      const crew = index < 7 ? regulars : [...regulars, ...seasonals];
      return {
        date: `2027-07-${String(index + 5).padStart(2, "0")}`,
        rentalCount: 40 + index * 7,
        closed: false,
        reviewCount: index === 0 ? 2_000 : index === 13 ? 2_090 : null,
        entries: crew.map((userId, i) => ({ userId, minutes: (7 + (i % 4)) * 60 })),
        tips: [],
      };
    });

    const result = calculatePeriod({ ...base, days });
    const paid = result.employees.reduce((sum, e) => sum + e.tipShareCents, 0);
    const pool = result.days.reduce((sum, d) => sum + d.poolCents, 0);

    expect(paid).toBe(pool);
    expect(result.employees).toHaveLength(7);

    // The seasonals only worked the back half, so they earn less than the
    // regulars — the day-by-day split handles a changing crew on its own.
    const regularTotal = result.employees
      .filter((e) => regulars.includes(e.userId))
      .reduce((sum, e) => sum + e.tipShareCents, 0);
    const seasonalTotal = result.employees
      .filter((e) => seasonals.includes(e.userId))
      .reduce((sum, e) => sum + e.tipShareCents, 0);
    expect(regularTotal).toBeGreaterThan(seasonalTotal);

    // And the review bonus, which is period-wide, still lands exactly.
    const reviewPaid = result.employees.reduce((sum, e) => sum + e.reviewShareCents, 0);
    expect(reviewPaid).toBe(result.reviewPoolCents);
    expect(result.reviewPoolCents).toBeGreaterThan(0);
  });

  it("never loses or invents a cent, across many awkward pools", () => {
    for (let pool = 999; pool <= 80_000; pool += 997) {
      for (const size of [2, 3, 7, 11]) {
        const shares = allocateByWeight(
          pool,
          Array.from({ length: size }, (_, i) => ({ key: `s${i}`, weight: 60 * (4 + (i % 5) * 0.25) })),
        );
        const total = [...shares.values()].reduce((a, b) => a + b, 0);
        expect(total, `pool ${pool} across ${size}`).toBe(pool);
      }
    }
  });
});
