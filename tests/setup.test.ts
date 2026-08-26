/**
 * The setup token is the only thing standing between a freshly deployed
 * instance and whoever finds the URL first, so its comparison is worth
 * testing directly.
 */
import { afterEach, describe, expect, it } from "vitest";

import { setupTokenConfigured, setupTokenMatches } from "@/lib/setup";

const original = process.env.SETUP_TOKEN;
afterEach(() => {
  if (original === undefined) delete process.env.SETUP_TOKEN;
  else process.env.SETUP_TOKEN = original;
});

describe("setup token configuration", () => {
  it("is not configured when unset or too short", () => {
    delete process.env.SETUP_TOKEN;
    expect(setupTokenConfigured()).toBe(false);

    process.env.SETUP_TOKEN = "";
    expect(setupTokenConfigured()).toBe(false);

    process.env.SETUP_TOKEN = "short";
    expect(setupTokenConfigured()).toBe(false);
  });

  it("is configured at eight characters or more", () => {
    process.env.SETUP_TOKEN = "abcd1234";
    expect(setupTokenConfigured()).toBe(true);
  });
});

describe("setup token comparison", () => {
  it("accepts the exact token", () => {
    process.env.SETUP_TOKEN = "correct-horse-battery";
    expect(setupTokenMatches("correct-horse-battery")).toBe(true);
  });

  it("rejects anything else", () => {
    process.env.SETUP_TOKEN = "correct-horse-battery";
    expect(setupTokenMatches("correct-horse-batterz")).toBe(false);
    expect(setupTokenMatches("correct-horse-batter")).toBe(false);
    expect(setupTokenMatches("correct-horse-batteryy")).toBe(false);
    expect(setupTokenMatches("")).toBe(false);
    expect(setupTokenMatches("CORRECT-HORSE-BATTERY")).toBe(false);
  });

  it("refuses every candidate when the token is unset or too short", () => {
    delete process.env.SETUP_TOKEN;
    expect(setupTokenMatches("")).toBe(false);
    expect(setupTokenMatches("anything")).toBe(false);

    // A short token must not become a weak-but-usable one.
    process.env.SETUP_TOKEN = "abc";
    expect(setupTokenMatches("abc")).toBe(false);
  });

  it("compares the whole token rather than stopping at the first difference", () => {
    process.env.SETUP_TOKEN = "aaaaaaaaaaaaaaaa";
    // Differing in the first or last position must both simply be false;
    // the loop has no early return, so neither leaks position through timing.
    expect(setupTokenMatches("baaaaaaaaaaaaaaa")).toBe(false);
    expect(setupTokenMatches("aaaaaaaaaaaaaaab")).toBe(false);
  });
});
