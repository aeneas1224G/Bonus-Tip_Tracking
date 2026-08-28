import "server-only";

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";

import { db } from "./db";

const COOKIE_NAME = "vtb_session";
const SESSION_HOURS = 12;
const BCRYPT_ROUNDS = 12;

export type SessionUser = {
  id: string;
  name: string;
  role: "ADMIN" | "EMPLOYEE";
};

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Generate one with `openssl rand -base64 32`.",
    );
  }
  return new TextEncoder().encode(value);
}

export function hashSecret(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifySecret(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

/**
 * Cached per request so a page that checks the session in several places
 * still only verifies the token and hits the database once.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;

    // Re-read the user so a deactivated account loses access immediately
    // rather than at token expiry.
    const user = await db.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, role: true, active: true },
    });
    if (!user || !user.active) return null;

    return { id: user.id, name: user.name, role: user.role };
  } catch {
    return null;
  }
});

export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  return session;
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireUser();
  if (session.role !== "ADMIN") throw new Error("FORBIDDEN");
  return session;
}

// --- PIN throttling ------------------------------------------------------
//
// A numeric PIN is a small keyspace however long it is, so the lockout is what
// actually protects it. Attempts are counted per employee and the account
// freezes once the threshold is passed.

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export type PinResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: "INVALID"; attemptsLeft: number }
  | { ok: false; reason: "LOCKED"; until: Date };

export async function verifyPin(userId: string, pin: string): Promise<PinResult> {
  const user = await db.user.findUnique({ where: { id: userId } });

  if (!user || !user.active || !user.pinHash || user.role !== "EMPLOYEE") {
    // Same shape as a wrong PIN so this cannot be used to probe for accounts.
    return { ok: false, reason: "INVALID", attemptsLeft: MAX_ATTEMPTS };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, reason: "LOCKED", until: user.lockedUntil };
  }

  const matches = await verifySecret(pin, user.pinHash);

  if (!matches) {
    const failedAttempts = user.failedAttempts + 1;
    const shouldLock = failedAttempts >= MAX_ATTEMPTS;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: shouldLock ? 0 : failedAttempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
      },
    });

    if (shouldLock) {
      return { ok: false, reason: "LOCKED", until: new Date(Date.now() + LOCKOUT_MINUTES * 60_000) };
    }
    return { ok: false, reason: "INVALID", attemptsLeft: MAX_ATTEMPTS - failedAttempts };
  }

  if (user.failedAttempts !== 0 || user.lockedUntil) {
    await db.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  }

  return { ok: true, user: { id: user.id, name: user.name, role: user.role } };
}

export type AdminAuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: "INVALID" }
  | { ok: false; reason: "LOCKED"; until: Date };

/**
 * A locked account used to be reported as simply "wrong", which meant an owner
 * typing their correct password during a lockout had no way to tell the
 * difference — and on an app with no password reset, that reads as being
 * permanently locked out.
 *
 * So the password is now checked even while the account is locked, and the
 * lockout is only revealed when the password was right. Someone who does not
 * know the password learns nothing, including whether the account exists.
 */
export async function verifyAdminPassword(
  username: string,
  password: string,
): Promise<AdminAuthResult> {
  // Case-insensitive, because an email address typed with a capital is the
  // same account and this app has no password reset to fall back on.
  const user = await db.user.findFirst({
    where: { username: { equals: username.trim(), mode: "insensitive" } },
  });
  if (!user || !user.active || !user.passwordHash || user.role !== "ADMIN") {
    // Burn roughly the same time as a real compare so a missing username and a
    // wrong password are not distinguishable by response timing.
    await bcrypt.compare(password, "$2a$12$" + "x".repeat(53));
    return { ok: false, reason: "INVALID" };
  }

  const matches = await verifySecret(password, user.passwordHash);
  const locked = user.lockedUntil !== null && user.lockedUntil > new Date();

  if (!matches) {
    // No point counting further attempts against an account already frozen.
    if (!locked) {
      const failedAttempts = user.failedAttempts + 1;
      await db.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: failedAttempts >= MAX_ATTEMPTS ? 0 : failedAttempts,
          lockedUntil:
            failedAttempts >= MAX_ATTEMPTS
              ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
              : null,
        },
      });
    }
    return { ok: false, reason: "INVALID" };
  }

  // Right password, wrong moment. Say so — the wait is finite and knowing that
  // is the difference between patience and a panicked database edit.
  if (locked) return { ok: false, reason: "LOCKED", until: user.lockedUntil! };

  await db.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null },
  });
  return { ok: true, user: { id: user.id, name: user.name, role: user.role } };
}
