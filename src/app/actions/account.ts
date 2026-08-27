"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requireAdmin, verifySecret } from "@/lib/auth";
import { db } from "@/lib/db";
import { pruneRateLimits, rateLimit } from "@/lib/rateLimit";
import { humanizeWait, PASSWORD_MIN, validatePassword } from "@/lib/password";
import { hashSecret } from "@/lib/auth";
import { validateUsername } from "@/lib/username";
import type { ActionState } from "./auth";

const schema = z.object({
  username: z.string(),
  currentPassword: z.string().min(1, "Enter your current password to confirm."),
});

/**
 * Change the owner's sign-in name.
 *
 * The current password is required. Without it, anyone who found an unlocked
 * machine with a live session could quietly move the sign-in name to an
 * address they control — and there is no password reset to undo it with.
 */
export async function changeUsername(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();

    pruneRateLimits();

    // Two tiers. The loose one caps how much bcrypt work anyone can demand;
    // the strict one, further down, only counts genuinely wrong passwords.
    // Typos in the form are not attack signals and must not use up the budget —
    // fumbling a form five times should never lock out the actual owner.
    const throughput = rateLimit(`account:${admin.id}`, { limit: 40, windowSeconds: 300 });
    if (!throughput.allowed) {
      return { error: `Too many attempts. Try again in ${humanizeWait(throughput.retryAfterSeconds)}.` };
    }

    const parsed = schema.safeParse({
      username: formData.get("username"),
      currentPassword: formData.get("currentPassword"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Check the details." };
    }

    const checked = validateUsername(parsed.data.username);
    if (!checked.ok) return { error: checked.message };

    const current = await db.user.findUnique({ where: { id: admin.id } });
    if (!current?.passwordHash) return { error: "This account cannot sign in with a password." };

    const correct = await verifySecret(parsed.data.currentPassword, current.passwordHash);
    if (!correct) {
      const wrong = rateLimit(`account-wrong:${admin.id}`, { limit: 5, windowSeconds: 300 });
      if (!wrong.allowed) {
        return {
          error: `Too many wrong passwords. Try again in ${humanizeWait(wrong.retryAfterSeconds)}.`,
        };
      }
      return { error: "That password is not right." };
    }

    if (current.username === checked.value) {
      return { success: "That is already your sign-in name — nothing changed." };
    }

    // Case-insensitive, so "Owner" and "owner" cannot both be taken.
    const clash = await db.user.findFirst({
      where: {
        username: { equals: checked.value, mode: "insensitive" },
        NOT: { id: admin.id },
      },
      select: { id: true },
    });
    if (clash) return { error: "Another account is already using that sign-in name." };

    await db.user.update({ where: { id: admin.id }, data: { username: checked.value } });

    await recordAudit({
      actorId: admin.id,
      action: "EMPLOYEE_UPDATE",
      entity: "User",
      entityId: admin.id,
      before: { username: current.username },
      after: { username: checked.value },
    });

    revalidatePath("/admin/account");
    return {
      success: `Done. Sign in with ${checked.value} from now on — your password has not changed.`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}


const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z.string(),
  confirmPassword: z.string(),
});

/**
 * Change the owner's password.
 *
 * The current password is required, so a walk-up on an unlocked machine cannot
 * lock the real owner out of their own payroll app. Until this existed the only
 * way to change a password was editing the database by hand, which is exactly
 * the situation it is meant to prevent anyone ever being in again.
 */
export async function changePassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();

    pruneRateLimits();

    const throughput = rateLimit(`account:${admin.id}`, { limit: 40, windowSeconds: 300 });
    if (!throughput.allowed) {
      return { error: `Too many attempts. Try again in ${humanizeWait(throughput.retryAfterSeconds)}.` };
    }

    const parsed = passwordSchema.safeParse({
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Check the details." };
    }

    const current = await db.user.findUnique({ where: { id: admin.id } });
    if (!current?.passwordHash) return { error: "This account cannot sign in with a password." };

    const correct = await verifySecret(parsed.data.currentPassword, current.passwordHash);
    if (!correct) {
      const wrong = rateLimit(`account-wrong:${admin.id}`, { limit: 5, windowSeconds: 300 });
      if (!wrong.allowed) {
        return {
          error: `Too many wrong passwords. Try again in ${humanizeWait(wrong.retryAfterSeconds)}.`,
        };
      }
      return { error: "That current password is not right." };
    }

    const checked = validatePassword(parsed.data.newPassword, parsed.data.confirmPassword);
    if (!checked.ok) return { error: checked.message };

    if (parsed.data.newPassword === parsed.data.currentPassword) {
      return { error: "That is the password you already have. Pick a different one." };
    }

    await db.user.update({
      where: { id: admin.id },
      data: {
        passwordHash: await hashSecret(parsed.data.newPassword),
        failedAttempts: 0,
        lockedUntil: null,
      },
    });

    // Never record the password itself, old or new.
    await recordAudit({
      actorId: admin.id,
      action: "EMPLOYEE_UPDATE",
      entity: "User",
      entityId: admin.id,
      after: { passwordChanged: true, minimumLength: PASSWORD_MIN },
    });

    revalidatePath("/admin/account");
    return {
      success:
        "Password changed. You are still signed in here — use the new one next time. " +
        "Save it somewhere safe now; there is no reset link.",
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}
