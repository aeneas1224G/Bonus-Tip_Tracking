/**
 * What counts as a valid owner sign-in name.
 *
 * Originally this was letters, numbers and a few punctuation marks — which
 * quietly rejected the "@" in an email address. Both are allowed now.
 *
 * Everything is stored lowercased. Nobody thinks of Owner@Shop.com and
 * owner@shop.com as different accounts, and treating them as different is a
 * good way to get locked out of an app that has no password reset.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 120;

/** Deliberately permissive but non-backtracking: one @, something either side, a dot in the domain. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The plain-username form: letters, digits, dot, dash, underscore. */
const PLAIN = /^[a-z0-9._-]+$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function looksLikeEmail(value: string): boolean {
  return value.includes("@");
}

export type UsernameCheck =
  | { ok: true; value: string }
  | { ok: false; message: string };

export function validateUsername(raw: string): UsernameCheck {
  const value = normalizeUsername(raw);

  if (value.length === 0) return { ok: false, message: "Enter a username." };
  if (value.length < USERNAME_MIN) {
    return { ok: false, message: `Needs at least ${USERNAME_MIN} characters.` };
  }
  if (value.length > USERNAME_MAX) {
    return { ok: false, message: `Keep it under ${USERNAME_MAX} characters.` };
  }

  if (looksLikeEmail(value)) {
    if (!EMAIL.test(value)) {
      return {
        ok: false,
        message: "That does not look like a complete email address — check for a typo.",
      };
    }
    return { ok: true, value };
  }

  if (!PLAIN.test(value)) {
    return {
      ok: false,
      message:
        "Use an email address, or a plain name made of letters, numbers, dots, dashes and underscores.",
    };
  }

  return { ok: true, value };
}
