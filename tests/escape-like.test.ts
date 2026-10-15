// tests/escape-like.test.ts — escapeLike makes user text literal inside an ilike pattern.
import { describe, expect, it } from "vitest";
import { escapeLike } from "@/lib/escape-like";

describe("escapeLike", () => {
  it("escapes the three LIKE metacharacters", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
  it("leaves plain text alone", () => {
    expect(escapeLike("Hazy IPA #14")).toBe("Hazy IPA #14");
  });
});
