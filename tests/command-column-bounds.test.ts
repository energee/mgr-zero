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
  { command: "upsert_water_profile", path: ["alkalinityPpm"], max: 999_999.9, over: 1_000_000, column: "numeric(7,1)" },
  { command: "upsert_water_profile", path: ["waterPh"], max: 14, over: 14.01, column: "numeric(4,2) between 0 and 14" },
  { command: "upsert_water_profile", path: ["waterPh"], max: 0, over: -0.01, column: "numeric(4,2) between 0 and 14" },
  { command: "record_movement", path: ["qty"], max: 9_999_999_999.99, over: 99_999_999_999, column: "numeric(12,2)" },
  { command: "record_movement", path: ["qty"], max: -9_999_999_999.99, over: -99_999_999_999, column: "numeric(12,2)" },
  { command: "create_purchase_order", path: ["lines", 0, "unitCostCents"], max: INT_MAX, over: 99_999_999_999, column: "int" },
  { command: "upsert_material_contract", path: ["unitCostCents"], max: INT_MAX, over: INT_MAX + 1, column: "int" },
  { command: "upsert_vessel", path: ["capacityBbl"], max: 9_999_999.999, over: 99_999_999, column: "numeric(10,3)" },
  { command: "schedule_batch", path: ["plannedBbl"], max: 9_999_999.999, over: 99_999_999, column: "numeric(10,3)" },
  { command: "create_keg_pool", path: ["depositCents"], max: INT_MAX, over: 99_999_999_999, column: "int" },
  { command: "update_keg_pool", path: ["perFillCents"], max: INT_MAX, over: INT_MAX + 1, column: "int" },
  { command: "create_purchase_order", path: ["lines", 0, "qtyOrdered"], max: 9_999_999_999.9999, over: 10_000_000_000, column: "numeric(14,4)" },
  { command: "upsert_material_contract", path: ["qtyCommitted"], max: 9_999_999_999.9999, over: 10_000_000_000, column: "numeric(14,4)" },
  { command: "upsert_vendor", path: ["leadTimeDays"], max: INT_MAX, over: INT_MAX + 1, column: "int" },
  { command: "schedule_packaging_run", path: ["outputs", 0, "qtyPlanned"], max: 9_999_999_999.99, over: 99_999_999_999, column: "numeric(12,2)" },
  { command: "close_packaging_run", path: ["outputs", 0, "qtyActual"], max: 9_999_999_999.99, over: 99_999_999_999, column: "numeric(12,2)" },
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

// #1482: a bound's message is shown to whoever sent the command, so it reads as
// an instruction with the limit, not zod's "Too big: expected number to be <=…".
it("says a number bound as an instruction", () => {
  const issue = (c: Case, value: number) => rangeIssue(c, value)?.message;
  expect(issue(CASES.find(c => c.path.includes("qtyOrdered"))!, 10_000_000_000)).toBe("Enter a number no greater than 9,999,999,999.9999.");
  expect(issue(CASES.find(c => c.path.includes("qtyCommitted"))!, 0)).toBe("Enter a number greater than 0.");
  expect(issue(CASES.find(c => c.path.includes("leadTimeDays"))!, -1)).toBe("Enter a number of at least 0.");
});
