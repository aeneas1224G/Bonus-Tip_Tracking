/**
 * Cross-check: the hand-typed fixture in august2026.ts against the sheet's own
 * CSV, parsed by machine.
 *
 * Every other test in this suite is written against the hand-typed fixture. If
 * that transcription is wrong, those tests are wrong with it and all of them
 * still pass. This file is the only thing standing between a typo and a wrong
 * paycheque, so it compares the two sources cell by cell.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseSheet } from "../scripts/import-sheet";
import { rentalBonusCents } from "@/lib/calc";
import { EVIE, JONAH, KYLE, PETE, RENTAL_TIERS, SHEET, TAYLOR } from "./fixtures/august2026";

const CSV = readFileSync(join(__dirname, "fixtures", "august-2026-sheet.csv"), "utf8");
const parsed = parseSheet(CSV);

/** The sheet uses display names; the fixture uses ids. */
const ID: Record<string, string> = {
  Jonah: JONAH,
  Evie: EVIE,
  Pete: PETE,
  Taylor: TAYLOR,
  Kyle: KYLE,
};

describe("the CSV parses into the shape the fixture claims", () => {
  it("finds the same 14 days", () => {
    expect(parsed.days.map((d) => d.date)).toEqual(SHEET.map((d) => d.date));
  });

  it("finds the same crew", () => {
    expect(parsed.names.map((n) => ID[n])).toEqual([JONAH, EVIE, PETE, TAYLOR, KYLE]);
  });
});

describe("hand-typed fixture vs machine-parsed sheet", () => {
  it("agrees on every rental count and closed day", () => {
    for (const [index, day] of parsed.days.entries()) {
      const fixture = SHEET[index];
      expect(day.rentalCount, `${day.date} rentals`).toBe(fixture.rentalCount);
      expect(day.closed, `${day.date} closed`).toBe(fixture.rentalCount === null);
    }
  });

  it("agrees on every hours cell", () => {
    for (const [index, day] of parsed.days.entries()) {
      const fixture = SHEET[index];
      const fromCsv = Object.fromEntries(
        Object.entries(day.hours).map(([name, hours]) => [ID[name], hours]),
      );
      expect(fromCsv, `${day.date} hours`).toEqual(fixture.hours);
    }
  });

  it("agrees on every dollar cell", () => {
    for (const [index, day] of parsed.days.entries()) {
      const fixture = SHEET[index];
      for (const [name, cents] of Object.entries(day.sheetCents)) {
        // The CSV carries a $0 cell for everyone listed that day; the fixture
        // only records people who actually worked. Compare where both have one.
        const expected = fixture.sheetCents[ID[name]];
        if (expected === undefined) {
          expect(cents, `${day.date} ${name} should be absent or zero`).toBe(0);
          continue;
        }
        expect(cents, `${day.date} ${name}`).toBe(expected);
      }
    }
  });

  it("agrees on the review readings that bound the period", () => {
    expect(parsed.days[0].reviewCount).toBe(1_887);
    expect(parsed.days[parsed.days.length - 1].reviewCount).toBe(1_941);
  });
});

describe("the sheet's own Bonus column vs our tier ladder", () => {
  it("derives every day's pool from the rental count", () => {
    for (const day of parsed.days) {
      const derived = day.closed || day.rentalCount === null
        ? 0
        : rentalBonusCents(day.rentalCount, RENTAL_TIERS);
      expect(derived, `${day.date} (${day.rentalCount} rentals)`).toBe(day.bonusCents);
    }
  });

  it("sums to the $2,800 the sheet paid out", () => {
    const total = parsed.days.reduce((sum, day) => sum + (day.bonusCents ?? 0), 0);
    expect(total).toBe(280_000);
  });
});
