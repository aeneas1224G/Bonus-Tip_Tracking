"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requireAdmin, verifySecret } from "@/lib/auth";
import { db } from "@/lib/db";
import { pruneRateLimits, rateLimit } from "@/lib/rateLimit";
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
    const limit = rateLimit(`username:${admin.id}`, { limit: 5, windowSeconds: 300 });
    if (!limit.allowed) {
      return { error: `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.` };
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
    if (!correct) return { error: "That password is not right." };

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
