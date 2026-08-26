import "server-only";

import { db } from "./db";

/**
 * First-run setup.
 *
 * A freshly deployed instance has an empty database and no way in. The
 * alternative to this page is running seed scripts against production from a
 * laptop, which is a poor thing to ask of the person whose payroll it is.
 *
 * Two things keep it from being a back door:
 *
 *   1. It refuses once an admin exists. There is no "reset" path here.
 *   2. It requires SETUP_TOKEN, set in the hosting environment before the
 *      first deploy. Without it nobody can claim the instance in the window
 *      between the deploy finishing and the owner reaching the page.
 */

export async function adminExists(): Promise<boolean> {
  return (await db.user.count({ where: { role: "ADMIN" } })) > 0;
}

export function setupTokenConfigured(): boolean {
  return (process.env.SETUP_TOKEN ?? "").length >= 8;
}

/** Constant-time compare so the token cannot be guessed a character at a time. */
export function setupTokenMatches(candidate: string): boolean {
  const expected = process.env.SETUP_TOKEN ?? "";
  if (expected.length < 8) return false;
  if (candidate.length !== expected.length) return false;

  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ candidate.charCodeAt(i);
  }
  return mismatch === 0;
}

/** The 2026 ladders, installed alongside the owner account on first run. */
export const INITIAL_RENTAL_TIERS: Array<{ minRentals: number; bonusCents: number }> = [
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

export const INITIAL_REVIEW_TIERS: Array<{ minReviews: number; perReviewCents: number }> = [
  { minReviews: 0, perReviewCents: 300 },
  { minReviews: 75, perReviewCents: 400 },
  { minReviews: 100, perReviewCents: 500 },
  { minReviews: 150, perReviewCents: 700 },
];

export const INITIAL_RESCUE_CENTS = 2_500;
