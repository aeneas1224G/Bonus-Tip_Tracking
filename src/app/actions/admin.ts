"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { hashSecret, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseDollarsToCents } from "@/lib/money";
import { parseISODate, periodForDate, shortDateLabel } from "@/lib/payPeriod";
import { checkPin, PIN_FORMAT_MESSAGE, PIN_PATTERN, PIN_WEAK_MESSAGE } from "@/lib/pin";
import { loadPeriod } from "@/lib/periods";
import type { ActionState } from "./auth";

// --- Employees -----------------------------------------------------------

const employeeSchema = z.object({
  name: z.string().min(1, "Enter a name.").max(60),
  initials: z.string().max(6).optional(),
  pin: z.string().regex(PIN_PATTERN, PIN_FORMAT_MESSAGE),
});

export async function createEmployee(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const parsed = employeeSchema.safeParse({
      name: formData.get("name"),
      initials: formData.get("initials")?.toString(),
      pin: formData.get("pin"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Check the details." };
    }
    if (checkPin(parsed.data.pin) === "WEAK") return { error: PIN_WEAK_MESSAGE };

    const duplicate = await db.user.findFirst({
      where: { name: parsed.data.name, role: "EMPLOYEE", active: true },
    });
    if (duplicate) return { error: `${parsed.data.name} is already on the roster.` };

    const user = await db.user.create({
      data: {
        name: parsed.data.name.trim(),
        initials: parsed.data.initials?.trim() || null,
        role: "EMPLOYEE",
        pinHash: await hashSecret(parsed.data.pin),
      },
    });

    await recordAudit({
      actorId: admin.id,
      action: "EMPLOYEE_CREATE",
      entity: "User",
      entityId: user.id,
      after: { name: user.name, initials: user.initials },
    });

    revalidatePath("/admin/employees");
    revalidatePath("/");
    return { success: `${user.name} added.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function resetPin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const userId = formData.get("userId")?.toString();
    const pin = formData.get("pin")?.toString() ?? "";

    if (!userId) return { error: "Missing employee." };
    const problem = checkPin(pin);
    if (problem === "FORMAT") return { error: PIN_FORMAT_MESSAGE };
    if (problem === "WEAK") return { error: PIN_WEAK_MESSAGE };

    const user = await db.user.update({
      where: { id: userId },
      data: { pinHash: await hashSecret(pin), failedAttempts: 0, lockedUntil: null },
    });

    // The PIN itself is never written to the audit log.
    await recordAudit({
      actorId: admin.id,
      action: "PIN_RESET",
      entity: "User",
      entityId: userId,
      after: { name: user.name },
    });

    revalidatePath("/admin/employees");
    return { success: `PIN updated for ${user.name}. It is also unlocked.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function setEmployeeActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const userId = formData.get("userId")?.toString();
    const active = formData.get("active") === "true";
    if (!userId) return { error: "Missing employee." };

    const user = await db.user.update({ where: { id: userId }, data: { active } });
    await recordAudit({
      actorId: admin.id,
      action: "EMPLOYEE_DEACTIVATE",
      entity: "User",
      entityId: userId,
      after: { name: user.name, active },
    });

    revalidatePath("/admin/employees");
    revalidatePath("/");
    return {
      success: active
        ? `${user.name} can sign in again.`
        : `${user.name} deactivated. Past entries and pay are untouched.`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function unlockAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const userId = formData.get("userId")?.toString();
    if (!userId) return { error: "Missing employee." };

    const user = await db.user.update({
      where: { id: userId },
      data: { failedAttempts: 0, lockedUntil: null },
    });
    await recordAudit({
      actorId: admin.id,
      action: "EMPLOYEE_UPDATE",
      entity: "User",
      entityId: userId,
      after: { name: user.name, unlocked: true },
    });

    revalidatePath("/admin/employees");
    return { success: `${user.name} unlocked.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

// --- Rates ---------------------------------------------------------------

/**
 * Editing rates never mutates the existing schedule. A new version is created
 * and marked current, so any period already pinned to the old one keeps the
 * numbers it was paid at.
 */
export async function saveRates(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();

    const rentalTiers: Array<{ minRentals: number; bonusCents: number }> = [];
    const reviewTiers: Array<{ minReviews: number; perReviewCents: number }> = [];

    for (const [key, raw] of formData.entries()) {
      const value = raw.toString();

      const rental = /^rental\.(\d+)$/.exec(key);
      if (rental) {
        const cents = parseDollarsToCents(value);
        if (value.trim() === "") continue;
        if (cents === null || cents < 0) {
          return { error: `Rental tier "${rental[1]}+" needs a dollar amount.` };
        }
        rentalTiers.push({ minRentals: Number(rental[1]), bonusCents: cents });
      }

      const review = /^review\.(\d+)$/.exec(key);
      if (review) {
        const cents = parseDollarsToCents(value);
        if (value.trim() === "") continue;
        if (cents === null || cents < 0) {
          return { error: `Review tier "${review[1]}+" needs a dollar amount.` };
        }
        reviewTiers.push({ minReviews: Number(review[1]), perReviewCents: cents });
      }
    }

    if (rentalTiers.length === 0 || reviewTiers.length === 0) {
      return { error: "Both ladders need at least one tier." };
    }

    const rescueRaw = formData.get("rescueDefault")?.toString() ?? "";
    const rescueDefaultCents = parseDollarsToCents(rescueRaw);
    if (rescueDefaultCents === null || rescueDefaultCents < 0) {
      return { error: "The rescue payout needs a dollar amount, like 25." };
    }

    const previous = await db.rateSchedule.findFirst({
      where: { isCurrent: true },
      include: { rentalTiers: true, reviewTiers: true },
    });

    await db.$transaction(async (tx) => {
      await tx.rateSchedule.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      await tx.rateSchedule.create({
        data: {
          label: `Updated ${new Date().toISOString().slice(0, 10)}`,
          effectiveFrom: new Date(),
          isCurrent: true,
          rescueDefaultCents,
          rentalTiers: { create: rentalTiers },
          reviewTiers: { create: reviewTiers },
        },
      });
    });

    await recordAudit({
      actorId: admin.id,
      action: "RATES_UPDATE",
      entity: "RateSchedule",
      before: previous
        ? {
            rentalTiers: previous.rentalTiers,
            reviewTiers: previous.reviewTiers,
            rescueDefaultCents: previous.rescueDefaultCents,
          }
        : undefined,
      after: { rentalTiers, reviewTiers, rescueDefaultCents },
    });

    revalidatePath("/admin/settings");
    revalidatePath("/admin");
    return {
      success:
        "New rates saved. Pay periods already locked keep the rates they were paid at.",
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

// --- Period lock ---------------------------------------------------------

export async function lockPeriod(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const startDate = formData.get("startDate")?.toString();
    if (!startDate) return { error: "Missing pay period." };

    const bounds = periodForDate(startDate);
    const loaded = await loadPeriod(bounds);

    // A day with hours but no rental count pays everyone who worked it $0.
    // Under day-by-day splitting that is silent and irreversible once locked,
    // so it blocks the lock rather than merely warning.
    const unpaidDays = loaded.result.days.filter(
      (day) => !day.closed && day.rentalCount === null && day.minutes > 0,
    );
    if (unpaidDays.length > 0) {
      const detail = unpaidDays
        .slice(0, 5)
        .map(
          (day) =>
            `${shortDateLabel(day.date)} (${(day.minutes / 60).toFixed(1)} hrs across ` +
            `${day.staffCount} ${day.staffCount === 1 ? "person" : "people"})`,
        )
        .join(", ");
      const more = unpaidDays.length > 5 ? ` and ${unpaidDays.length - 5} more` : "";
      return {
        error:
          `Cannot lock yet. ${unpaidDays.length} ${unpaidDays.length === 1 ? "day has" : "days have"} ` +
          `hours logged but no rental count, so everyone who worked would earn $0 for ${
            unpaidDays.length === 1 ? "it" : "them"
          }: ${detail}${more}. Enter the rentals, or mark the day closed, then lock.`,
      };
    }

    const backwardReviews = loaded.result.warnings.filter(
      (warning) => warning.code === "REVIEW_COUNT_WENT_BACKWARD",
    );
    if (backwardReviews.length > 0) {
      return { error: `${backwardReviews[0].message} Fix that before locking.` };
    }

    const currentSchedule = await db.rateSchedule.findFirst({ where: { isCurrent: true } });

    await db.payPeriod.update({
      where: { startDate: parseISODate(bounds.startDate) },
      data: {
        status: "LOCKED",
        lockedAt: new Date(),
        // Freeze both the numbers and the rate version behind them.
        lockedSnapshot: loaded.result as never,
        rateScheduleId: currentSchedule?.id ?? undefined,
      },
    });

    await recordAudit({
      actorId: admin.id,
      action: "PERIOD_LOCK",
      entity: "PayPeriod",
      entityId: loaded.period.id,
      after: {
        startDate: bounds.startDate,
        totalPoolCents: loaded.result.totalPoolCents,
        totalMinutes: loaded.result.totalMinutes,
      },
    });

    revalidatePath("/admin");
    revalidatePath("/period");
    return { success: "Pay period locked. Totals are final and ready for Gusto." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function unlockPeriod(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const startDate = formData.get("startDate")?.toString();
    if (!startDate) return { error: "Missing pay period." };

    const bounds = periodForDate(startDate);
    const period = await db.payPeriod.update({
      where: { startDate: parseISODate(bounds.startDate) },
      data: { status: "OPEN", lockedAt: null },
    });

    await recordAudit({
      actorId: admin.id,
      action: "PERIOD_UNLOCK",
      entity: "PayPeriod",
      entityId: period.id,
      before: { startDate: bounds.startDate, status: "LOCKED" },
    });

    revalidatePath("/admin");
    revalidatePath("/period");
    return {
      success:
        "Pay period unlocked. The snapshot of what was paid is kept, so you can compare after editing.",
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}
