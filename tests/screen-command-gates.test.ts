// tests/screen-command-gates.test.ts — an ungated screen write is a product
// promise. If it is not in the registry, the page cannot do what the inventory
// shows: gate it ([SCHEMA-GATE] / [IMPLEMENTATION-GATE]) until the command ships.
import { describe, expect, it } from "vitest";
import { SCREENS } from "@/components/mgr/screens";
import { getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/all";

const TAGGED = /\[(SCHEMA-GATE|IMPLEMENTATION-GATE|client state|platform|view|[^\]]*design)/i;

// The inventory tags a list once at its end ("create_bin · update_bin ·
// delete_bin [SCHEMA-GATE …]"), so a part inherits the next tagged part's tag.
function writeNames(writes: unknown): string[] {
  if (typeof writes !== "string") return [];
  const parts = writes.split("·").map((p) => p.trim());
  const names: string[] = [];
  let covered = false;
  for (const part of [...parts].reverse()) {
    if (/\[/.test(part)) covered = TAGGED.test(part);
    if (covered) continue;
    const name = part.match(/^([a-z_]+)/)?.[1];
    if (name && name.includes("_")) names.push(name);
  }
  return names;
}

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
