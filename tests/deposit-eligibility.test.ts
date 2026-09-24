// Keg-deposit eligibility lives in one function (#497): order-line adjustment
// charges new lines through private.ensure_order_deposit_lines instead of
// repeating its predicate and its "not configured" check.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The body of the newest migration's definition of `name`. */
function latestDefinition(name: string): string {
  const start = new RegExp(`create (or replace )?function ${name.replace(".", "\\.")}\\s*\\(`, "i");
  const sql = readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql")).sort()
    .map((file) => readFileSync(`supabase/migrations/${file}`, "utf8"))
    .filter((text) => start.test(text)).at(-1) ?? "";
  const from = sql.search(start);
  return sql.slice(from, sql.indexOf("end $", from));
}

describe("keg-deposit eligibility", () => {
  it("adjust_order_lines_impl charges new lines through ensure_order_deposit_lines", () => {
    const body = latestDefinition("private.adjust_order_lines_impl");
    expect(body).toContain("private.ensure_order_deposit_lines(o)");
    expect(body).not.toContain("per_fill_rental");
    expect(body).not.toContain("deposit is not configured");
  });
});
