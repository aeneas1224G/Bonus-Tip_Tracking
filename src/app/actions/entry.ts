"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseDollarsToCents, parseHoursToMinutes } from "@/lib/money";
import { parseISODate, todayISO } from "@/lib/payPeriod";
import { ensureDay } from "@/lib/periods";
import type { ActionState } from "./auth";

const MAX_MINUTES_PER_DAY = 24 * 60;

/**
 * The edit window, as agreed: an employee may correct their own entry until
 * the end of the day it belongs to. The owner may edit anything, but nobody
 * can touch a locked period without unlocking it first.
 */
async function assertWritable(dateISO: string, targetUserId: string) {
  const session = await requireUser();
  const isAdmin = session.role === "ADMIN";

  const day = await db.dayRecord.findUnique({
    where: { date: parseISODate(dateISO) },
    include: { payPeriod: true },
  });

  if (day?.payPeriod.status === "LOCKED") {
    throw new Error(
      "This pay period is locked. The owner needs to unlock it before anything can change.",
    );
  }

  if (isAdmin) return { session, isAdmin };

  if (targetUserId !== session.id) {
    throw new Error("You can only change your own entries.");
  }
  if (dateISO !== todayISO()) {
    throw new Error(
      "That day has closed. Ask the owner to fix it — they can edit any day until the period is locked.",
    );
  }
  return { session, isAdmin };
}

const shiftSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  userId: z.string().min(1),
  hours: z.string(),
});

export async function saveShift(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const parsed = shiftSchema.safeParse({
      date: formData.get("date"),
      userId: formData.get("userId"),
      hours: formData.get("hours"),
    });
    if (!parsed.success) return { error: "Check the date and hours and try again." };

    const { date, userId, hours } = parsed.data;
    const { session } = await assertWritable(date, userId);

    // The owner does not take shifts and does not share in the pool. The UI
    // never offers it, but an admin could otherwise post a shift for their own
    // account and quietly dilute everyone's split.
    const target = await db.user.findUnique({
      where: { id: userId },
      select: { role: true, active: true, name: true },
    });
    if (!target) return { error: "That employee no longer exists." };
    if (target.role !== "EMPLOYEE") {
      return { error: "Only employees log hours. The owner does not share in the bonus pool." };
    }

    const minutes = parseHoursToMinutes(hours);
    if (minutes === null) {
      return { error: "Enter hours as a number, like 8 or 7.5." };
    }
    if (minutes > MAX_MINUTES_PER_DAY) {
      return { error: "That is more than 24 hours. Check the number." };
    }

    const day = await ensureDay(date);
    const existing = await db.shiftEntry.findUnique({
      where: { dayRecordId_userId: { dayRecordId: day.id, userId } },
    });

    if (minutes === 0) {
      if (existing) {
        await db.shiftEntry.delete({ where: { id: existing.id } });
        await recordAudit({
          actorId: session.id,
          action: "SHIFT_DELETE",
          entity: "ShiftEntry",
          entityId: existing.id,
          before: { date, userId, minutes: existing.minutes },
        });
      }
      revalidatePath("/entry");
      revalidatePath("/period");
      revalidatePath("/admin");
      return { success: "Hours cleared." };
    }

    const saved = await db.shiftEntry.upsert({
      where: { dayRecordId_userId: { dayRecordId: day.id, userId } },
      update: { minutes },
      create: { dayRecordId: day.id, userId, minutes },
    });

    await recordAudit({
      actorId: session.id,
      action: existing ? "SHIFT_UPDATE" : "SHIFT_CREATE",
      entity: "ShiftEntry",
      entityId: saved.id,
      before: existing ? { minutes: existing.minutes } : undefined,
      after: { date, userId, minutes },
    });

    revalidatePath("/entry");
    revalidatePath("/period");
    revalidatePath("/admin");
    return { success: "Hours saved." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

const daySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rentalCount: z.string().optional(),
  reviewCount: z.string().optional(),
  ebikeCount: z.string().optional(),
  closerId: z.string().optional(),
  notes: z.string().max(1_000).optional(),
  closed: z.string().optional(),
});

function optionalInt(value: string | undefined, max: number): number | null | "invalid" {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) return "invalid";
  return parsed;
}

/** The shared daily numbers. Any signed-in employee may enter these. */
export async function saveDayNumbers(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const parsed = daySchema.safeParse({
      date: formData.get("date"),
      rentalCount: formData.get("rentalCount")?.toString(),
      reviewCount: formData.get("reviewCount")?.toString(),
      ebikeCount: formData.get("ebikeCount")?.toString(),
      closerId: formData.get("closerId")?.toString(),
      notes: formData.get("notes")?.toString(),
      closed: formData.get("closed")?.toString(),
    });
    if (!parsed.success) return { error: "Check the numbers and try again." };

    const session = await requireUser();
    const { date } = parsed.data;

    const existing = await db.dayRecord.findUnique({
      where: { date: parseISODate(date) },
      include: { payPeriod: true },
    });
    if (existing?.payPeriod.status === "LOCKED") {
      return { error: "This pay period is locked. Unlock it first." };
    }
    // Shared numbers follow the same window as hours: today for staff, any
    // open day for the owner.
    if (session.role !== "ADMIN" && date !== todayISO()) {
      return { error: "That day has closed. Ask the owner to correct it." };
    }

    const rentalCount = optionalInt(parsed.data.rentalCount, 10_000);
    const reviewCount = optionalInt(parsed.data.reviewCount, 10_000_000);
    const ebikeCount = optionalInt(parsed.data.ebikeCount, 10_000);

    if (rentalCount === "invalid") return { error: "Rentals must be a whole number." };
    if (reviewCount === "invalid") return { error: "Review count must be a whole number." };
    if (ebikeCount === "invalid") return { error: "Ebike count must be a whole number." };

    const day = await ensureDay(date);
    const before = {
      rentalCount: day.rentalCount,
      reviewCount: day.reviewCount,
      ebikeCount: day.ebikeCount,
      closed: day.closed,
      notes: day.notes,
      closerId: day.closerId,
    };

    const closerId = parsed.data.closerId?.trim() || null;
    const after = {
      rentalCount,
      reviewCount,
      ebikeCount,
      closed: parsed.data.closed === "on" || parsed.data.closed === "true",
      notes: parsed.data.notes?.trim() || null,
      closerId,
    };

    await db.dayRecord.update({ where: { id: day.id }, data: after });
    await recordAudit({
      actorId: session.id,
      action: "DAY_UPDATE",
      entity: "DayRecord",
      entityId: day.id,
      before,
      after: { date, ...after },
    });

    revalidatePath("/entry");
    revalidatePath("/period");
    revalidatePath("/admin");
    return { success: "Day saved." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

const tipSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  userId: z.string().min(1),
  amount: z.string(),
  kind: z.enum(["WATER", "RESCUE", "OTHER"]),
  note: z.string().max(300).optional(),
});

export async function addTip(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const parsed = tipSchema.safeParse({
      date: formData.get("date"),
      userId: formData.get("userId"),
      amount: formData.get("amount"),
      kind: formData.get("kind") ?? "OTHER",
      note: formData.get("note")?.toString(),
    });
    if (!parsed.success) return { error: "Check the tip details and try again." };

    const { date, userId, kind, note } = parsed.data;
    const { session } = await assertWritable(date, userId);

    const target = await db.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (target?.role !== "EMPLOYEE") {
      return { error: "Cash tips can only be credited to an employee." };
    }

    const amountCents = parseDollarsToCents(parsed.data.amount);
    if (amountCents === null || amountCents <= 0) {
      return { error: "Enter a tip amount like 25 or 25.50." };
    }
    if (amountCents > 100_000_00) return { error: "That tip looks too large. Check the amount." };

    const day = await ensureDay(date);
    const tip = await db.individualTip.create({
      data: { dayRecordId: day.id, userId, amountCents, kind, note: note?.trim() || null },
    });

    await recordAudit({
      actorId: session.id,
      action: "TIP_CREATE",
      entity: "IndividualTip",
      entityId: tip.id,
      after: { date, userId, amountCents, kind, note },
    });

    revalidatePath("/entry");
    revalidatePath("/period");
    revalidatePath("/admin");
    return { success: "Tip added." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function deleteTip(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const tipId = formData.get("tipId")?.toString();
    if (!tipId) return { error: "Missing tip." };

    const tip = await db.individualTip.findUnique({
      where: { id: tipId },
      include: { dayRecord: true },
    });
    if (!tip) return { error: "That tip no longer exists." };

    const dateISO = tip.dayRecord.date.toISOString().slice(0, 10);
    const { session } = await assertWritable(dateISO, tip.userId);

    await db.individualTip.delete({ where: { id: tipId } });
    await recordAudit({
      actorId: session.id,
      action: "TIP_DELETE",
      entity: "IndividualTip",
      entityId: tipId,
      before: { date: dateISO, userId: tip.userId, amountCents: tip.amountCents },
    });

    revalidatePath("/entry");
    revalidatePath("/period");
    revalidatePath("/admin");
    return { success: "Tip removed." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}
