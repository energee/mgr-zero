// tests/escape-regex.test.ts — escapeRegex makes user text literal inside a Postgres regex.
import { describe, expect, it } from "vitest";
import { escapeRegex, quotedRegex, quotedSearchPattern } from "@/lib/escape-regex";

describe("escapeRegex", () => {
  it("escapes every regex metacharacter", () => {
    expect(escapeRegex("a*b.c+d?e|f^g$h(i)j[k]l{m}n\\")).toBe("a\\*b\\.c\\+d\\?e\\|f\\^g\\$h\\(i\\)j\\[k\\]l\\{m\\}n\\\\");
  });
  it("leaves plain text, % and _ alone", () => {
    expect(escapeRegex("Hazy 100% IPA #14_b")).toBe("Hazy 100% IPA #14_b");
  });
});

describe("quotedRegex", () => {
  it("double-quotes a regex for or(), keeping its anchor and escaping quotes and backslashes again", () => {
    expect(quotedRegex(`^${escapeRegex('a"b(')}`)).toBe('"^a\\"b\\\\("');
  });
});

describe("quotedSearchPattern", () => {
  it("keeps literal text inside a quoted PostgREST filter value", () => {
    expect(quotedSearchPattern('Hazy, "IPA" (100%)\\')).toBe('"Hazy, \\"IPA\\" \\\\(100%\\\\)\\\\\\\\"');
  });
});
