/**
 * Load a pay period out of the shop's Google Sheet.
 *
 * The sheet is parsed here rather than hand-transcribed, so this doubles as an
 * independent check on the fixtures in tests/. If the parser and the fixture
 * disagree, one of them is wrong and the test suite alone would not catch it.
 *
 * Export the tab as CSV (File > Download > Comma-separated values), then:
 *
 *   npx tsx scripts/import-sheet.ts <file.csv> [--with-tips] [--dry-run]
 *
 * --with-tips  also creates the individual cash tips implied by the gap between
 *              the sheet's dollar cell and the pro-rata share. These are
 *              DERIVED, not read from a column, and are marked as such in
 *              their note.
 * --dry-run    parse and report without writing anything.
 *
 * Departed staff are created as INACTIVE accounts with no PIN, so their history
 * has somewhere to attach without granting anyone a login.
 */
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";

/**
 * Run standalone, so .env has to be read here — only the Prisma CLI and Next
 * load it for you. Anything already in the environment wins.
 */
function loadEnvFile(path = ".env"): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i.exec(line);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] !== undefined) continue;
    process.env[key] = match[2].trim().replace(/^["'](.*)["']$/, "$1");
  }
}

loadEnvFile();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Put it in .env or export it before running.");
  process.exit(1);
}

const db = new PrismaClient();

// --- CSV ------------------------------------------------------------------

/** Minimal RFC 4180 reader: handles quoted fields and embedded newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const norm = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

function toNumber(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** "8/10/26" -> "2026-08-10" */
function toISO(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(value.trim());
  if (!match) return null;
  const [, m, d, y] = match;
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  return `${year}-${String(Number(m)).padStart(2, "0")}-${String(Number(d)).padStart(2, "0")}`;
}

// --- Sheet shape ----------------------------------------------------------

type Column = { name: string; hoursIndex: number; moneyIndex: number };

/**
 * The grid repeats (Hrs, <Name>) pairs. Reading them off the header rather than
 * assuming fixed positions means the other tab, with a different crew and an
 * extra column, parses with the same code.
 */
function findEmployeeColumns(header: string[]): Column[] {
  const columns: Column[] = [];
  for (let i = 0; i < header.length - 1; i += 1) {
    if (norm(header[i]) !== "hrs") continue;
    const name = header[i + 1].trim();
    if (name === "") continue; // an unnamed spare column
    columns.push({ name, hoursIndex: i, moneyIndex: i + 1 });
  }
  return columns;
}

function findIndex(header: string[], needle: string): number {
  return header.findIndex((cell) => norm(cell).includes(needle));
}

export type ParsedDay = {
  date: string;
  rentalCount: number | null;
  closed: boolean;
  bonusCents: number | null;
  reviewCount: number | null;
  ebikeCount: number | null;
  closerInitials: string | null;
  notes: string | null;
  hours: Record<string, number>;
  sheetCents: Record<string, number>;
};

export function parseSheet(text: string): { days: ParsedDay[]; names: string[] } {
  const rows = parseCsv(text);
  const headerRow = rows.findIndex((row) => norm(row[0] ?? "") === "date");
  if (headerRow === -1) throw new Error('Could not find the header row (no "Date" cell in column A).');

  const header = rows[headerRow];
  const columns = findEmployeeColumns(header);
  if (columns.length === 0) throw new Error("Found no (Hrs, Name) column pairs in the header.");

  const rentalsIdx = findIndex(header, "#rentals");
  const bonusIdx = findIndex(header, "bonus");
  const closerIdx = findIndex(header, "closer");
  const ebikesIdx = findIndex(header, "ebikes");
  const reviewIdx = findIndex(header, "review");
  const notesIdx = reviewIdx === -1 ? -1 : reviewIdx + 1;

  const days: ParsedDay[] = [];
  for (const row of rows.slice(headerRow + 1)) {
    const date = toISO(row[0] ?? "");
    if (!date) continue;

    const rentalsRaw = (row[rentalsIdx] ?? "").trim();
    const closed = rentalsRaw.toLowerCase() === "x";

    const hours: Record<string, number> = {};
    const sheetCents: Record<string, number> = {};
    for (const column of columns) {
      const h = toNumber(row[column.hoursIndex] ?? "");
      const m = toNumber(row[column.moneyIndex] ?? "");
      if (h !== null && h > 0) hours[column.name] = h;
      if (m !== null) sheetCents[column.name] = Math.round(m * 100);
    }

    days.push({
      date,
      rentalCount: closed ? null : toNumber(rentalsRaw),
      closed,
      bonusCents: bonusIdx === -1 ? null : ((v) => (v === null ? null : Math.round(v * 100)))(toNumber(row[bonusIdx] ?? "")),
      reviewCount: reviewIdx === -1 ? null : toNumber(row[reviewIdx] ?? ""),
      ebikeCount: ebikesIdx === -1 ? null : toNumber(row[ebikesIdx] ?? ""),
      closerInitials: closerIdx === -1 ? null : (row[closerIdx] ?? "").trim() || null,
      notes: notesIdx === -1 ? null : (row[notesIdx] ?? "").trim() || null,
      hours,
      sheetCents,
    });
  }

  return { days, names: columns.map((c) => c.name) };
}

// --- Import ---------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const path = args.find((a) => !a.startsWith("--"));
  const withTips = args.includes("--with-tips");
  const dryRun = args.includes("--dry-run");

  if (!path) {
    console.error("Usage: npx tsx scripts/import-sheet.ts <file.csv> [--with-tips] [--dry-run]");
    process.exit(1);
  }

  const { days, names } = parseSheet(readFileSync(path, "utf8"));
  console.log(`Parsed ${days.length} days, crew: ${names.join(", ")}`);
  if (days.length === 0) throw new Error("No dated rows found.");

  const startDate = days[0].date;
  const endDate = days[days.length - 1].date;
  console.log(`Period ${startDate} -> ${endDate}`);

  if (dryRun) {
    for (const day of days) {
      const crew = Object.entries(day.hours)
        .map(([n, h]) => `${n} ${h}h`)
        .join(", ");
      console.log(
        `  ${day.date}  ${day.closed ? "CLOSED" : String(day.rentalCount ?? "-").padStart(4)}` +
          `  bonus ${day.bonusCents === null ? "-" : `$${(day.bonusCents / 100).toFixed(0)}`}` +
          `  reviews ${day.reviewCount ?? "-"}  ${crew}`,
      );
    }
    console.log("\nDry run — nothing written.");
    return;
  }

  // payPeriod and calc are pure; periods.ts is marked server-only and cannot be
  // loaded outside Next, so the two rows it would have created are made here.
  const { periodForDate, parseISODate, datesInPeriod, toISODate } = await import(
    "../src/lib/payPeriod"
  );
  const { calculatePeriod } = await import("../src/lib/calc");

  const ensurePeriod = async (dateISO: string) => {
    const bounds = periodForDate(dateISO);
    const startDate = parseISODate(bounds.startDate);
    const existing = await db.payPeriod.findUnique({ where: { startDate } });
    if (existing) return existing;

    const current = await db.rateSchedule.findFirst({ where: { isCurrent: true } });
    return db.payPeriod.create({
      data: {
        startDate,
        endDate: parseISODate(bounds.endDate),
        rateScheduleId: current?.id ?? null,
        days: { create: datesInPeriod(bounds).map((iso) => ({ date: parseISODate(iso) })) },
      },
    });
  };

  const ensureDay = async (dateISO: string) => {
    const date = parseISODate(dateISO);
    const existing = await db.dayRecord.findUnique({ where: { date } });
    if (existing) return existing;
    const period = await ensurePeriod(dateISO);
    return db.dayRecord.create({ data: { date, payPeriodId: period.id } });
  };

  // Employees: reuse an existing account by name, otherwise create an inactive
  // one. Departed staff must never gain a login just because history mentions them.
  const userIds = new Map<string, string>();
  for (const name of names) {
    const existing = await db.user.findFirst({ where: { name, role: "EMPLOYEE" } });
    if (existing) {
      userIds.set(name, existing.id);
      continue;
    }
    const created = await db.user.create({
      data: { name, role: "EMPLOYEE", active: false, pinHash: null },
    });
    userIds.set(name, created.id);
    console.log(`  created INACTIVE account for ${name} (historical, no PIN, cannot sign in)`);
  }

  await ensurePeriod(startDate);

  for (const day of days) {
    const record = await ensureDay(day.date);
    await db.dayRecord.update({
      where: { id: record.id },
      data: {
        rentalCount: day.rentalCount,
        closed: day.closed,
        reviewCount: day.reviewCount,
        ebikeCount: day.ebikeCount,
        notes: day.notes,
      },
    });

    for (const [name, hours] of Object.entries(day.hours)) {
      const userId = userIds.get(name)!;
      const minutes = Math.round(hours * 60);
      await db.shiftEntry.upsert({
        where: { dayRecordId_userId: { dayRecordId: record.id, userId } },
        update: { minutes },
        create: { dayRecordId: record.id, userId, minutes },
      });
    }
  }

  console.log("Hours, rentals and review counts imported.");

  if (!withTips) {
    console.log("Cash tips NOT imported (pass --with-tips to derive them).");
    return;
  }

  // Derive tips from the gap between the sheet's cell and the pro-rata share.
  const bounds = periodForDate(startDate);
  const period = await db.payPeriod.findUnique({
    where: { startDate: parseISODate(bounds.startDate) },
    include: { days: { include: { entries: true, tips: true } } },
  });
  if (!period) throw new Error("Period vanished mid-import.");

  const schedule = await db.rateSchedule.findFirst({
    where: { isCurrent: true },
    include: { rentalTiers: true, reviewTiers: true },
  });

  const computed = calculatePeriod({
    days: period.days.map((d) => ({
      date: toISODate(d.date),
      rentalCount: d.rentalCount,
      closed: d.closed,
      reviewCount: d.reviewCount,
      entries: d.entries.map((e) => ({ userId: e.userId, minutes: e.minutes })),
      tips: [],
    })),
    rentalTiers: (schedule?.rentalTiers ?? []).map((t) => ({
      minRentals: t.minRentals,
      bonusCents: t.bonusCents,
    })),
    reviewTiers: (schedule?.reviewTiers ?? []).map((t) => ({
      minReviews: t.minReviews,
      perReviewCents: t.perReviewCents,
    })),
    reviewBaseline: null,
  });

  let created = 0;
  let totalCents = 0;
  for (const day of days) {
    const breakdown = computed.days.find((d) => d.date === day.date);
    if (!breakdown) continue;
    const record = await db.dayRecord.findUnique({ where: { date: parseISODate(day.date) } });
    if (!record) continue;

    for (const [name, sheetCents] of Object.entries(day.sheetCents)) {
      const userId = userIds.get(name)!;
      const share = breakdown.shares.find((s) => s.userId === userId)?.shareCents ?? 0;
      const residual = Math.round((sheetCents - share) / 100) * 100;
      if (residual < 100) continue; // under a dollar is the sheet's own rounding

      await db.individualTip.create({
        data: {
          dayRecordId: record.id,
          userId,
          amountCents: residual,
          kind: residual % 2_500 === 0 ? "RESCUE" : "OTHER",
          note: "Derived on import from the spreadsheet's daily cell",
        },
      });
      created += 1;
      totalCents += residual;
    }
  }

  console.log(`Derived ${created} cash tips totalling $${(totalCents / 100).toFixed(2)}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
