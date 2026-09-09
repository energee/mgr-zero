// tests/screen-command-gates.test.ts — an ungated screen write is a product
// promise. If it is not in the registry, the page cannot do what the inventory
// shows: gate it ([SCHEMA-GATE] / [IMPLEMENTATION-GATE]) until the command ships.
import { describe, expect, it } from "vitest";
import { SCREENS } from "@/components/mgr/screens";
import { getCommandDefinition } from "@/lib/commands/registry";
import { isUngated, taggedOperations } from "@/lib/mgr/screen-routes";
import "@/lib/commands/all";

const TAGGED = /\[(SCHEMA-GATE|IMPLEMENTATION-GATE|client state|platform|view|[^\]]*design)/i;

// The tag-inheritance rule (a list tagged once at its end covers every part
// before it) lives in lib/mgr/screen-routes.ts, which the parity set needs it
// for too; this file only decides which tags excuse a name from the registry.
const writeNames = (writes: unknown) =>
  taggedOperations(writes).filter((t) => !TAGGED.test(t.tag)).map((t) => t.name);

describe("ungated screen writes", () => {
  it("are registered commands", () => {
    const missing: string[] = [];
    for (const screen of SCREENS) {
      for (const name of writeNames(screen.writes)) {
        if (!getCommandDefinition(name)) missing.push(`${screen.name}: ${name}`);
      }
    }
    expect(missing, "ungate the screen only after the command exists").toEqual([]);
  });

  it("every screen declares writes as a string the parser can read", () => {
    const jsx = SCREENS.filter((s) => typeof s.writes !== "string").map((s) => s.name);
    expect(jsx).toEqual([]);
  });
});


it("keeps interval pages gated while their command API is available", () => {
  for (const name of ["tap_keg", "kick_keg", "swap_keg", "list_open_taps"]) expect(getCommandDefinition(name)).toBeDefined();
  for (const name of ["Tap board", "Kick keg", "Swap keg"]) expect(isUngated(SCREENS.find(s => s.name === name)!)).toBe(false);
});

it("keeps variance page gated while the read API is available", () => {
  expect(getCommandDefinition("get_taproom_variance")).toBeDefined();
  expect(isUngated(SCREENS.find(s => s.name === "Variance by brand")!)).toBe(false);
});

it("ships the weekly count screen with its durable reads and write", () => {
  const screen = SCREENS.find(s => s.name === "Weekly count")!;
  for (const name of ["get_taproom_count_snapshot", "get_taproom_draft_projection", "list_taproom_counts", "get_taproom_count", "record_taproom_count"])
    expect(getCommandDefinition(name)).toBeDefined();
  expect(isUngated(screen)).toBe(true);
});
