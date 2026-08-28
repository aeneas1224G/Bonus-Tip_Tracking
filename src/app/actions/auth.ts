"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createSession, destroySession, getSession, verifyAdminPassword, verifyPin } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { humanizeWait } from "@/lib/password";
import { PIN_LENGTH, PIN_PATTERN } from "@/lib/pin";
import { pruneRateLimits, rateLimit } from "@/lib/rateLimit";

export type ActionState = { error?: string; success?: string };

async function clientKey(prefix: string): Promise<string> {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return `${prefix}:${ip}`;
}

const pinSchema = z.object({
  userId: z.string().min(1),
  pin: z.string().regex(PIN_PATTERN, `Enter your ${PIN_LENGTH}-digit PIN.`),
});

export async function loginWithPin(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  pruneRateLimits();

  // Per-IP throttle in front of the per-account lockout, so one machine cannot
  // grind the keyspace by rotating through employees.
  const limit = rateLimit(await clientKey("pin"), { limit: 10, windowSeconds: 60 });
  if (!limit.allowed) {
    return { error: `Too many attempts from this device. Try again in ${humanizeWait(limit.retryAfterSeconds)}.` };
  }

  const parsed = pinSchema.safeParse({
    userId: formData.get("userId"),
    pin: formData.get("pin"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? `Enter your ${PIN_LENGTH}-digit PIN.` };
  }

  const result = await verifyPin(parsed.data.userId, parsed.data.pin);

  if (!result.ok) {
    await recordAudit({
      actorId: parsed.data.userId,
      action: "LOGIN_FAILED",
      entity: "User",
      entityId: parsed.data.userId,
    });

    if (result.reason === "LOCKED") {
      const minutes = Math.max(1, Math.ceil((result.until.getTime() - Date.now()) / 60_000));
      return {
        error: `Too many wrong PINs. This account is locked for ${minutes} more minute${minutes === 1 ? "" : "s"}. Ask the owner to unlock it.`,
      };
    }
    return {
      error: `That PIN is not right. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? "" : "s"} left before the account locks.`,
    };
  }

  await createSession(result.user);
  await recordAudit({
    actorId: result.user.id,
    action: "LOGIN",
    entity: "User",
    entityId: result.user.id,
  });
  redirect("/entry");
}

const adminSchema = z.object({
  username: z.string().min(1, "Enter your username."),
  password: z.string().min(1, "Enter your password."),
});

export async function loginAsAdmin(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  pruneRateLimits();

  const limit = rateLimit(await clientKey("admin"), { limit: 8, windowSeconds: 300 });
  if (!limit.allowed) {
    return {
      error:
        `Too many sign-in attempts from this device. Try again in ` +
        `${humanizeWait(limit.retryAfterSeconds)}. This is a limit on the device, ` +
        `not your account — your password is fine if you know it.`,
    };
  }

  const parsed = adminSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  const result = await verifyAdminPassword(parsed.data.username, parsed.data.password);

  if (!result.ok) {
    await recordAudit({ action: "LOGIN_FAILED", entity: "User", entityId: parsed.data.username });

    if (result.reason === "LOCKED") {
      const minutes = Math.max(1, Math.ceil((result.until.getTime() - Date.now()) / 60_000));
      return {
        error:
          `That password is correct, but the account is locked for ${minutes} more ` +
          `minute${minutes === 1 ? "" : "s"} after too many failed attempts. ` +
          `Wait it out and sign in again — nothing else is wrong.`,
      };
    }
    return { error: "Username or password is not right." };
  }

  await createSession(result.user);
  await recordAudit({
    actorId: result.user.id,
    action: "LOGIN",
    entity: "User",
    entityId: result.user.id,
  });
  redirect("/admin");
}

export async function logout(): Promise<void> {
  const session = await getSession();
  if (session) {
    await recordAudit({
      actorId: session.id,
      action: "LOGOUT",
      entity: "User",
      entityId: session.id,
    });
  }
  await destroySession();
  redirect("/");
}
