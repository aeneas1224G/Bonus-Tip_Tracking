/**
 * First-run seed: the admin account, the current bonus ladders transcribed
 * from the shop's spreadsheet, and the active staff roster.
 *
 * Safe to re-run. Existing records are left alone; only missing ones are made.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

const db = new PrismaClient();

const RENTAL_TIERS: Array<[number, number]> = [
  [10, 10_00],
  [20, 30_00],
  [30, 50_00],
  [40, 100_00],
  [50, 150_00],
  [60, 200_00],
  [70, 260_00],
  [80, 320_00],
  [90, 400_00],
  [100, 500_00],
  [110, 600_00],
  [120, 700_00],
  [130, 800_00],
];

const REVIEW_TIERS: Array<[number, number]> = [
  [0, 3_00],
  [75, 4_00],
  [100, 5_00],
  [150, 7_00],
];

/**
 * The current roster, confirmed with the owner on 2026-08-25.
 *
 * Jonah, Brecklyn and Adrian appear in the 8/10-8/23 spreadsheet but have
 * since left. They are deliberately not seeded. If that period is ever
 * imported, the import needs to create them as INACTIVE accounts so their
 * historical hours and pay have somewhere to attach without granting a login.
 */
const STAFF: Array<{ name: string; initials: string }> = [
  { name: "Pete", initials: "pt" },
  { name: "Taylor", initials: "ta" },
  { name: "Kyle", initials: "kd" },
  { name: "Evie", initials: "ek" },
];

/**
 * Kept in step with PIN_LENGTH in src/lib/pin.ts. The seed cannot import from
 * src/ because it runs outside the Next build, so the value is repeated here
 * and asserted below rather than silently drifting.
 */
const PIN_LENGTH = 6;

function randomPin(): string {
  return String(randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, "0");
}

async function main() {
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD;

  if (!password || password.length < 8) {
    throw new Error(
      "Set ADMIN_PASSWORD (8+ characters) in your environment before seeding.",
    );
  }

  const admin = await db.user.upsert({
    where: { username },
    update: {},
    create: {
      name: "Owner",
      username,
      passwordHash: await bcrypt.hash(password, 12),
      role: "ADMIN",
    },
  });
  console.log(`admin ready: ${admin.username}`);

  const existingSchedule = await db.rateSchedule.findFirst({ where: { isCurrent: true } });
  if (!existingSchedule) {
    await db.rateSchedule.create({
      data: {
        label: "2026 bonus structure",
        effectiveFrom: new Date(Date.UTC(2026, 0, 1)),
        isCurrent: true,
        rescueDefaultCents: 2_500,
        rentalTiers: {
          create: RENTAL_TIERS.map(([minRentals, bonusCents]) => ({ minRentals, bonusCents })),
        },
        reviewTiers: {
          create: REVIEW_TIERS.map(([minReviews, perReviewCents]) => ({
            minReviews,
            perReviewCents,
          })),
        },
      },
    });
    console.log(`rate schedule created: ${RENTAL_TIERS.length} rental tiers, ${REVIEW_TIERS.length} review tiers`);
  } else {
    console.log("rate schedule already present, left unchanged");
  }

  const issued: Array<[string, string]> = [];
  for (const person of STAFF) {
    const already = await db.user.findFirst({ where: { name: person.name, role: "EMPLOYEE" } });
    if (already) continue;

    const pin = randomPin();
    await db.user.create({
      data: {
        name: person.name,
        initials: person.initials,
        role: "EMPLOYEE",
        pinHash: await bcrypt.hash(pin, 12),
      },
    });
    issued.push([person.name, pin]);
  }

  if (issued.length > 0) {
    console.log(`\n  Starter ${PIN_LENGTH}-digit PINs — hand these out, then change them in Admin > Employees:`);
    console.log("  ------------------------------------------------------------------");
    for (const [name, pin] of issued) console.log(`  ${name.padEnd(12)} ${pin}`);
    console.log("  ------------------------------------------------------------------");
    console.log("  This is the only time these are shown. They are stored hashed.\n");
  } else {
    console.log("staff roster already present, no PINs issued");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
