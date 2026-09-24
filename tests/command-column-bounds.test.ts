// #427: a number larger than its database column allows must fail zod input
// validation (400) instead of reaching Postgres and raising 22003 (500). Pure:
// only parses command input schemas, never runs a handler.
import { describe, expect, it } from "vitest";
import { getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Case = { command: string; path: (string | number)[]; max: number; over: number; column: string };

const INT_MAX = 2_147_483_647;
const CASES: Case[] = [
  { command: "set_channel_price", path: ["unitPriceCents"], max: INT_MAX, over: INT_MAX + 1, column: "int" },
  { command: "upsert_water_profile", path: ["calciumPpm"], max: 999_999.9, over: 1_000_000, column: "numeric(7,1)" },
  { command: "upsert_water_profile", path: ["bicarbonatePpm"], max: 999_999.9, over: 1_000_000, column: "numeric(7,1)" },
  { command: "upsert_brand", path: ["abv"], max: 99.99, over: 150, column: "numeric(4,2)" },
  { command: "record_movement", path: ["qty"], max: 9_999_999_999.99, over: 99_999_999_999, column: "numeric(12,2)" },
  { command: "record_movement", path: ["qty"], max: -9_999_999_999.99, over: -99_999_999_999, column: "numeric(12,2)" },
  { command: "create_purchase_order", path: ["lines", 0, "unitCostCents"], max: INT_MAX, over: 99_999_999_999, column: "int" },
  { command: "upsert_material_contract", path: ["unitCostCents"], max: INT_MAX, over: INT_MAX + 1, column: "int" },
  { command: "upsert_vessel", path: ["capacityBbl"], max: 9_999_999.999, over: 99_999_999, column: "numeric(10,3)" },
  { command: "schedule_batch", path: ["plannedBbl"], max: 9_999_999.999, over: 99_999_999, column: "numeric(10,3)" },
  { command: "create_keg_pool", path: ["depositCents"], max: INT_MAX, over: 99_999_999_999, column: "int" },
  { command: "update_keg_pool", path: ["perFillCents"], max: INT_MAX, over: INT_MAX + 1, column: "int" },
];

/** Build a payload holding `value` at `path`; the other fields may be missing — only this path's issues are read. */
function payload(path: Case["path"], value: number): unknown {
  return path.reduceRight<unknown>((inner, key) => (typeof key === "number" ? [inner] : { [key]: inner }), value);
}

function rangeIssue(c: Case, value: number) {
  const parsed = getCommandDefinition(c.command)!.input.safeParse(payload(c.path, value));
  if (parsed.success) return undefined;
  return parsed.error.issues.find(
    (i) => JSON.stringify(i.path) === JSON.stringify(c.path) && (i.code === "too_big" || i.code === "too_small"),
  );
}

describe("command number inputs are bounded by their columns (#427)", () => {
  it.each(CASES)("$command $path rejects $over ($column)", (c) => {
    expect(rangeIssue(c, c.over)).toBeDefined();
  });
  it.each(CASES)("$command $path accepts $max ($column)", (c) => {
    expect(rangeIssue(c, c.max)).toBeUndefined();
  });
});
