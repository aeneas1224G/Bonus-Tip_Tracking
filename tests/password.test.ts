import { describe, expect, it } from "vitest";

import { humanizeWait, PASSWORD_MIN, validatePassword } from "@/lib/password";

describe("password rules", () => {
  it("requires a real length floor", () => {
    expect(PASSWORD_MIN).toBe(12);
    expect(validatePassword("short").ok).toBe(false);
    expect(validatePassword("a".repeat(PASSWORD_MIN - 1)).ok).toBe(false);
    expect(validatePassword("a".repeat(PASSWORD_MIN)).ok).toBe(true);
  });

  it("says why, in terms of what the account controls", () => {
    const result = validatePassword("nope");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/controls payroll/i);
  });

  it("accepts a passphrase without demanding symbols", () => {
    // Complexity rules push people toward Password1! and a sticky note.
    expect(validatePassword("correct horse battery staple").ok).toBe(true);
  });

  it("rejects one made only of spaces", () => {
    expect(validatePassword(" ".repeat(20)).ok).toBe(false);
  });

  it("rejects something absurdly long", () => {
    expect(validatePassword("a".repeat(201)).ok).toBe(false);
  });

  it("checks the confirmation when one is given", () => {
    expect(validatePassword("a-long-enough-password", "a-long-enough-password").ok).toBe(true);
    const mismatch = validatePassword("a-long-enough-password", "something-else-entirely");
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.message).toMatch(/do not match/i);
  });

  it("reports length before mismatch, so the more useful error wins", () => {
    const result = validatePassword("short", "different");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/at least/i);
  });
});

describe("wait times read like a sentence", () => {
  it("never shows raw seconds", () => {
    expect(humanizeWait(1)).toBe("about a minute");
    expect(humanizeWait(60)).toBe("about a minute");
    expect(humanizeWait(61)).toBe("about 2 minutes");
    expect(humanizeWait(192)).toBe("about 4 minutes");
    expect(humanizeWait(900)).toBe("about 15 minutes");
  });
});
