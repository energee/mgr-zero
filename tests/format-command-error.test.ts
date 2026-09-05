import { describe, expect, it } from "vitest";
import { formatCommandError } from "@/lib/commands/format-command-error";

const issues = JSON.stringify([
  { origin: "string", code: "invalid_format", format: "uuid", pattern: "/^[0-9a-f]+$/", path: ["customerId"], message: "Invalid UUID" },
  { origin: "array", code: "too_small", minimum: 1, inclusive: true, path: ["lines"], message: "Too small: expected array to have >=1 items" },
  { origin: "number", code: "too_small", minimum: 0, path: ["lines", 0, "qty"], message: "Too small: expected number to be >0" },
]);

describe("formatCommandError", () => {
  it("turns a zod validation failure into per-field sentences without regexes", () => {
    const out = formatCommandError(`validation failed: ${issues}`);
    expect(out).toBe("Customer is required. Lines: add at least one. Line 1 qty: expected number to be >0.");
    expect(out).not.toContain("[0-9a-f]");
  });

  it("passes other messages through unchanged", () => {
    expect(formatCommandError("permission denied: create_order requires [\"admin\"]")).toBe("permission denied: create_order requires [\"admin\"]");
    expect(formatCommandError("validation failed: not json")).toBe("validation failed: not json");
  });
});
