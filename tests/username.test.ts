import { describe, expect, it } from "vitest";

import { looksLikeEmail, normalizeUsername, validateUsername } from "@/lib/username";

const ok = (raw: string) => {
  const result = validateUsername(raw);
  if (!result.ok) throw new Error(`expected "${raw}" to be valid: ${result.message}`);
  return result.value;
};
const bad = (raw: string) => {
  const result = validateUsername(raw);
  expect(result.ok, `expected "${raw}" to be rejected`).toBe(false);
  return result.ok ? "" : result.message;
};

describe("email addresses", () => {
  it("accepts an ordinary one", () => {
    expect(ok("admin@vistatrailbikes.com")).toBe("admin@vistatrailbikes.com");
  });

  it("accepts the shapes real addresses come in", () => {
    ok("pete.taylor@vistatrailbikes.com");
    ok("owner+payroll@vistatrailbikes.com");
    ok("o'brien@vista-trail.co.uk");
    ok("a@b.io");
  });

  it("rejects one that is missing a piece", () => {
    bad("admin@");
    bad("@vistatrailbikes.com");
    bad("admin@vistatrailbikes");     // no dot in the domain
    bad("admin@@vistatrailbikes.com");
    bad("admin @vistatrailbikes.com"); // space
  });
});

describe("plain usernames still work", () => {
  it("accepts the kind of name the setup page used to require", () => {
    expect(ok("owner")).toBe("owner");
    ok("pete_t");
    ok("vista.owner");
    ok("owner-2026");
  });

  it("rejects spaces and punctuation that would be confusing to type", () => {
    bad("the owner");
    bad("owner!");
    bad("owner/admin");
  });
});

describe("normalising", () => {
  it("lowercases and trims, so capitals can never lock you out", () => {
    expect(ok("  Admin@VistaTrailBikes.COM  ")).toBe("admin@vistatrailbikes.com");
    expect(ok("Owner")).toBe("owner");
    expect(normalizeUsername("  MiXeD  ")).toBe("mixed");
  });
});

describe("length", () => {
  it("rejects something too short to be deliberate", () => {
    bad("");
    bad("ab");
    expect(ok("abc")).toBe("abc");
  });

  it("rejects something absurdly long", () => {
    bad("a".repeat(200) + "@b.com");
  });
});

describe("looksLikeEmail", () => {
  it("is only about the @, so a malformed address gets an email-shaped error", () => {
    expect(looksLikeEmail("admin@vista.com")).toBe(true);
    expect(looksLikeEmail("admin@")).toBe(true);
    expect(looksLikeEmail("owner")).toBe(false);
  });

  it("gives a typo-shaped message for a broken email rather than a charset lecture", () => {
    expect(bad("admin@vistatrailbikes")).toMatch(/complete email address/i);
    expect(bad("the owner")).toMatch(/letters, numbers/i);
  });
});
