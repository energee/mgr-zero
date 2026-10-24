import { describe, expect, it } from "vitest";
import { getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/taproom";
import { beginTapBoardAttempt, editTapBoardSheet, openTapBoardSheet, tapSheetNeeds } from "@/lib/mgr/tap-board-state";
import { tapNumberSchema } from "@/lib/tap-number";

const id = "11111111-1111-4111-8111-111111111111";
const invalid = ["abc", "-3", "1.5", "1e2", "0", "000", " ", "1 2", "+3", "9007199254740992", "99999999999999999999", "9".repeat(80), "9".repeat(81)];
const valid = [undefined, "1", "003", "9007199254740991", "0".repeat(79) + "1"];
const commandInput = (command: string, tapNumber?: string) => command === "tap_keg"
  ? { locationId: id, keg: { label: "Guest cider", nominalBbl: .5 }, openingFill: 1, tapNumber }
  : { openIntervalId: id, closeFill: 0, reason: "Empty", incomingOpeningFill: 1, tapNumber };

describe("strict new tap number validation", () => {
  it.each(invalid)("rejects unsupported new number %s", tapNumber => {
    expect(tapNumberSchema.safeParse(tapNumber).success).toBe(false);
  });
  it.each(valid)("accepts optional, repeated and exact integer identifiers %s", tapNumber => {
    expect(tapNumberSchema.optional().safeParse(tapNumber).success).toBe(true);
  });
});

for (const command of ["tap_keg", "swap_keg"]) describe(`${command} replay input`, () => {
  it.each(["abc", "-3", "1.5", "1e2", "99999999999999999999"])("keeps legacy number %s eligible for database replay", tapNumber => {
    const result = getCommandDefinition(command)!.input.safeParse(commandInput(command, tapNumber));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject({ tapNumber });
  });
});

describe("tap sheet number validation", () => {
  const initial = openTapBoardSheet({ open: [], history: [] }, "tap", null, id, id);
  it.each(invalid)("withholds invalid number %s with a field-specific reason", tapNumber => {
    const state = editTapBoardSheet(initial, { tapNumber });
    expect(tapSheetNeeds(state.sheet!)).toHaveProperty("tapNumber");
    expect(() => beginTapBoardAttempt(state, id)).toThrow(/tap number/);
  });
  it.each(["", ...valid.filter((value): value is string => value !== undefined)])("preserves valid optional number %s", tapNumber => {
    const state = beginTapBoardAttempt(editTapBoardSheet(initial, { tapNumber }), id);
    expect(state.sheet!.attempt).toMatchObject({ kind: "submitting", payload: { tapNumber: tapNumber || undefined } });
  });
});
