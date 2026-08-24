/**
 * All money in this app is integer cents. All hours are integer minutes.
 * Floating point never touches a dollar amount.
 */

export const CENTS_PER_DOLLAR = 100;
export const MINUTES_PER_HOUR = 60;

export function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / CENTS_PER_DOLLAR);
  const remainder = abs % CENTS_PER_DOLLAR;
  const body = `$${dollars.toLocaleString("en-US")}.${String(remainder).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

/** "$5.11/hr" style display for a rate that is itself derived, not stored. */
export function formatRate(cents: number): string {
  return `${formatCents(cents)}/hr`;
}

export function minutesToHours(minutes: number): number {
  return minutes / MINUTES_PER_HOUR;
}

export function formatHours(minutes: number): string {
  const hours = minutes / MINUTES_PER_HOUR;
  return hours.toFixed(2).replace(/\.00$/, "");
}

/**
 * Parse a user-typed hours value ("10", "10.5", "7:30") into whole minutes.
 * Returns null when the input is not a usable number.
 */
export function parseHoursToMinutes(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(trimmed);
  if (clock) {
    return Number(clock[1]) * MINUTES_PER_HOUR + Number(clock[2]);
  }

  const decimal = Number(trimmed);
  if (!Number.isFinite(decimal) || decimal < 0) return null;
  // Round to the nearest minute so 7.33 hours stores cleanly.
  return Math.round(decimal * MINUTES_PER_HOUR);
}

/** Parse a typed dollar amount ("25", "$25.50", "1,200") into integer cents. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^-?\d*\.?\d{0,2}$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * CENTS_PER_DOLLAR);
}

export type WeightedShare = { key: string; weight: number };

/**
 * Split `poolCents` across `shares` in proportion to weight, using the
 * largest-remainder method so the allocations sum to EXACTLY poolCents.
 *
 * Plain rounding leaks pennies: five people splitting $100 by equal hours
 * each get $20.00 here, but three people splitting $100 get 33.34/33.33/33.33,
 * not 33.33 x 3 = $99.99. The leftover cents go to the largest fractional
 * remainders, then to the largest weight, then alphabetically by key — so the
 * result is deterministic and reruns produce identical numbers.
 */
export function allocateByWeight(
  poolCents: number,
  shares: WeightedShare[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const share of shares) result.set(share.key, 0);

  const totalWeight = shares.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight <= 0 || poolCents === 0 || shares.length === 0) {
    return result;
  }

  const scratch = shares.map((share) => {
    const exact = (poolCents * share.weight) / totalWeight;
    const floored = Math.floor(exact);
    return { ...share, floored, fraction: exact - floored };
  });

  let distributed = scratch.reduce((sum, s) => sum + s.floored, 0);
  let remainder = poolCents - distributed;

  scratch.sort((a, b) => {
    if (b.fraction !== a.fraction) return b.fraction - a.fraction;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.key.localeCompare(b.key);
  });

  for (const entry of scratch) {
    const bonus = remainder > 0 ? 1 : 0;
    result.set(entry.key, entry.floored + bonus);
    remainder -= bonus;
  }

  return result;
}
