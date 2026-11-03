import { createRequire } from "node:module";
import type AjvConstructor from "conf/node_modules/ajv";
import type * as FastUri from "fast-uri";
import { describe, expect, it } from "vitest";

// Resolve the copies actually consumed by shadcn's dotenvx/conf graph.
const requireShadcn = createRequire(import.meta.resolve("shadcn"));
const requireDotenvx = createRequire(requireShadcn.resolve("@dotenvx/dotenvx"));
const requireConf = createRequire(requireDotenvx.resolve("conf"));
const requireAjv = createRequire(requireConf.resolve("ajv"));
const uri = requireAjv("fast-uri") as typeof FastUri;
const Ajv = requireConf("ajv") as typeof AjvConstructor;

describe("approved tooling dependency patches (#1667)", () => {
  it("does not turn an encoded scheme into an executable URL", () => {
    const encoded = "%6Aavascript:alert(1)";
    expect(uri.parse(encoded).error).toBeTruthy();
    expect(uri.normalize(encoded)).toBe(encoded);
    expect(() => uri.resolve("https://example.invalid/", encoded)).toThrow();
    expect(uri.equal("%68ttp://example.invalid/", "http://example.invalid/")).toBe(false);
  });

  it("preserves relative-reference destinations during normalization", () => {
    const base = "https://example.invalid/schemas/nested/order.json";
    for (const reference of ["../amount.json", "a/../amount.json"]) {
      expect(uri.resolve(base, uri.normalize(reference))).toBe(uri.resolve(base, reference));
    }
    expect(uri.equal("../amount.json", "amount.json")).toBe(false);
  });

  it("rejects ambiguous hosts rather than silently changing the authority", () => {
    for (const malformed of ["http://a@b@evil.invalid/", "http://ev\til.invalid/"]) {
      expect(uri.parse(malformed).error).toBeTruthy();
      expect(uri.normalize(malformed)).toBe(malformed);
      expect(() => uri.resolve("https://example.invalid/", malformed)).toThrow();
    }
  });

  it("does not introduce a scheme when serializing a suffix reference", () => {
    const serialized = uri.serialize({ path: "javascript:alert(1)" }, { reference: "suffix" });
    expect(uri.parse(serialized).scheme).toBeUndefined();
    const normalized = uri.normalize("javascript:alert(1)", { reference: "suffix", scheme: "x" });
    expect(uri.parse(normalized).scheme).toBeUndefined();
  });

  it("keeps conf's AJV consumer resolving relative schema references", () => {
    const ajv = new Ajv();
    ajv.addSchema({
      $id: "https://example.invalid/schemas/amount.json",
      type: "integer",
      minimum: 1,
    });
    const validate = ajv.compile({
      $id: "https://example.invalid/schemas/order.json",
      type: "object",
      properties: { amount: { $ref: "amount.json" } },
      required: ["amount"],
      additionalProperties: false,
    });
    expect(validate({ amount: 2 })).toBe(true);
    expect(validate({ amount: 0 })).toBe(false);
    expect(validate({ amount: "2" })).toBe(false);
  });
});
