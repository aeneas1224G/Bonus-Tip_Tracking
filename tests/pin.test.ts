import { describe, expect, it } from "vitest";

import {
  checkPin,
  isValidPinFormat,
  isWeakPin,
  PIN_INPUT_PATTERN,
  PIN_KEYSPACE,
  PIN_LENGTH,
  PIN_PATTERN,
} from "@/lib/pin";

describe("PIN length", () => {
  it("is six digits", () => {
    expect(PIN_LENGTH).toBe(6);
    expect(PIN_KEYSPACE).toBe(1_000_000);
  });

  it("derives its pattern from the length rather than hard-coding it", () => {
    expect(PIN_PATTERN.source).toBe(`^\\d{${PIN_LENGTH}}$`);
    expect(PIN_INPUT_PATTERN).toBe(`\\d{${PIN_LENGTH}}`);
  });
});

describe("format validation", () => {
  it("accepts exactly six digits, including leading zeros", () => {
    expect(isValidPinFormat("482071")).toBe(true);
    expect(isValidPinFormat("000123")).toBe(true);
  });

  it("rejects the old four-digit PINs", () => {
    expect(isValidPinFormat("4820")).toBe(false);
  });

  it("rejects anything that is not six plain digits", () => {
    expect(isValidPinFormat("48207")).toBe(false);
    expect(isValidPinFormat("4820712")).toBe(false);
    expect(isValidPinFormat("48-071")).toBe(false);
    expect(isValidPinFormat("abcdef")).toBe(false);
    expect(isValidPinFormat("")).toBe(false);
    expect(isValidPinFormat(" 482071 ")).toBe(false);
  });
});

describe("weak PIN rejection", () => {
  it("rejects every digit the same", () => {
    for (const digit of "0123456789") {
      expect(isWeakPin(digit.repeat(6)), digit.repeat(6)).toBe(true);
    }
  });

  it("rejects repeated blocks", () => {
    expect(isWeakPin("121212")).toBe(true);
    expect(isWeakPin("123123")).toBe(true);
    expect(isWeakPin("454545")).toBe(true);
    expect(isWeakPin("900900")).toBe(true);
  });

  it("rejects straight runs in either direction", () => {
    expect(isWeakPin("123456")).toBe(true);
    expect(isWeakPin("456789")).toBe(true);
    expect(isWeakPin("654321")).toBe(true);
    expect(isWeakPin("987654")).toBe(true);
  });

  it("accepts an ordinary PIN", () => {
    expect(isWeakPin("482071")).toBe(false);
    expect(isWeakPin("930514")).toBe(false);
    expect(isWeakPin("100000")).toBe(false);
    expect(isWeakPin("122333")).toBe(false);
  });

  it("does not flag a malformed PIN as weak — that is a format error", () => {
    expect(isWeakPin("1234")).toBe(false);
    expect(isWeakPin("abc")).toBe(false);
  });
});

describe("checkPin", () => {
  it("reports format problems before weakness", () => {
    expect(checkPin("1234")).toBe("FORMAT");
    expect(checkPin("111111")).toBe("WEAK");
    expect(checkPin("482071")).toBeNull();
  });
});
