"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { createSession, hashSecret } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  adminExists,
  INITIAL_RENTAL_TIERS,
  INITIAL_RESCUE_CENTS,
  INITIAL_REVIEW_TIERS,
  setupTokenConfigured,
  setupTokenMatches,
} from "@/lib/setup";
import { humanizeWait } from "@/lib/password";
import { pruneRateLimits, rateLimit } from "@/lib/rateLimit";
import { validatePassword } from "@/lib/password";
import { validateUsername } from "@/lib/username";
import type { ActionState } from "./auth";

const schema = z
  .object({
    token: z.string().min(1, "Enter the setup token."),
    username: z.string(),
    password: z.string(),
    confirm: z.string(),
  });

export async function completeSetup(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    pruneRateLimits();
    const limit = rateLimit("setup", { limit: 5, windowSeconds: 300 });
    if (!limit.allowed) {
      return { error: `Too many attempts. Try again in ${humanizeWait(limit.retryAfterSeconds)}.` };
    }

    if (!setupTokenConfigured()) {
      return {
        error:
          "SETUP_TOKEN is not set on the server. Add it in your hosting environment " +
          "(at least 8 characters) and redeploy before running setup.",
      };
    }

    // Checked before anything is written, and again inside the transaction.
    if (await adminExists()) {
      return { error: "Setup has already been completed. Sign in instead." };
    }

    const parsed = schema.safeParse({
      token: formData.get("token"),
      username: formData.get("username"),
      password: formData.get("password"),
      confirm: formData.get("confirm"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Check the details." };
    }

    if (!setupTokenMatches(parsed.data.token)) {
      return { error: "That setup token is not right." };
    }

    const username = validateUsername(parsed.data.username);
    if (!username.ok) return { error: username.message };

    const password = validatePassword(parsed.data.password, parsed.data.confirm);
    if (!password.ok) return { error: password.message };

    const passwordHash = await hashSecret(parsed.data.password);

    const admin = await db.$transaction(async (tx) => {
      // The guard that actually counts: two people hitting setup at once both
      // pass the check above, so re-check inside the transaction.
      if ((await tx.user.count({ where: { role: "ADMIN" } })) > 0) {
        throw new Error("ALREADY_SET_UP");
      }

      const created = await tx.user.create({
        data: {
          name: "Owner",
          username: username.value,
          passwordHash,
          role: "ADMIN",
        },
      });

      if ((await tx.rateSchedule.count()) === 0) {
        await tx.rateSchedule.create({
          data: {
            label: "2026 bonus structure",
            effectiveFrom: new Date(Date.UTC(2026, 0, 1)),
            isCurrent: true,
            rescueDefaultCents: INITIAL_RESCUE_CENTS,
            rentalTiers: { create: INITIAL_RENTAL_TIERS },
            reviewTiers: { create: INITIAL_REVIEW_TIERS },
          },
        });
      }

      return created;
    });

    await recordAudit({
      actorId: admin.id,
      action: "EMPLOYEE_CREATE",
      entity: "User",
      entityId: admin.id,
      after: { username: admin.username, role: "ADMIN", via: "first-run setup" },
    });

    await createSession({ id: admin.id, name: admin.name, role: "ADMIN" });
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_SET_UP") {
      return { error: "Setup has already been completed. Sign in instead." };
    }
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }

  redirect("/admin/employees");
}
