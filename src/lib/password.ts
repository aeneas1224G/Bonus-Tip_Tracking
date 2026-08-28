/**
 * Owner password rules, in one place.
 *
 * There is no password reset in this app, so the only floor worth enforcing is
 * length. Complexity rules push people toward "Password1!" and a sticky note;
 * a long passphrase from a password manager is what we actually want.
 */

export const PASSWORD_MIN = 12;

export type PasswordCheck = { ok: true } | { ok: false; message: string };

export function validatePassword(password: string, confirm?: string): PasswordCheck {
  if (password.length < PASSWORD_MIN) {
    return {
      ok: false,
      message: `Use at least ${PASSWORD_MIN} characters — this account controls payroll.`,
    };
  }
  if (password.length > 200) {
    return { ok: false, message: "That is longer than 200 characters." };
  }
  if (password.trim().length === 0) {
    return { ok: false, message: "A password of only spaces is too easy to mistype." };
  }
  if (confirm !== undefined && password !== confirm) {
    return { ok: false, message: "The two passwords do not match." };
  }
  return { ok: true };
}

/**
 * "192 seconds" is a machine talking. Someone locked out of their own payroll
 * app deserves a sentence they can act on.
 */
export function humanizeWait(seconds: number): string {
  if (seconds <= 60) return "about a minute";
  const minutes = Math.ceil(seconds / 60);
  return `about ${minutes} minutes`;
}
