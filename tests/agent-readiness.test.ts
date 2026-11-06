// tests/agent-readiness.test.ts — the readiness scorecard in docs/plans/agent-access.md.
// The counts must be right on a small fixture, and the real numbers can only go up.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import "@/lib/commands/all";
import { listTools } from "@/lib/commands/registry";
import { measureReadiness, type ReadinessTool } from "@/lib/mgr/agent-readiness";
import { leafFields, valuesAt } from "@/lib/mgr/api-schema";

describe("leafFields", () => {
  it("reaches nested fields and sees a description on any wrapper", () => {
    const schema = z.object({
      orderId: z.uuid().describe("The order"),
      note: z.string().optional().describe("A note"),
      lines: z.array(z.object({ skuId: z.uuid(), qty: z.number() })),
    });
    expect(leafFields(schema)).toEqual([
      { name: "orderId", description: "The order", path: ["orderId"] },
      { name: "note", description: "A note", path: ["note"] },
      { name: "skuId", description: undefined, path: ["lines", "*", "skuId"] },
      { name: "qty", description: undefined, path: ["lines", "*", "qty"] },
    ]);
  });

  it("reads each object in a union, and treats a union of values as one field", () => {
    expect(leafFields(z.union([z.object({ a: z.string() }), z.object({ b: z.string() })])).map(f => f.name)).toEqual(["a", "b"]);
    expect(leafFields(z.object({ when: z.union([z.string(), z.number()]) })).map(f => f.name)).toEqual(["when"]);
  });
});

describe("valuesAt", () => {
  it("reads each array item and says where the value sits", () => {
    const input = { ship: [{ sources: [{ lotId: "a" }, { lotId: "b" }] }, { sources: [{ lotId: "c" }] }] };
    expect(valuesAt(input, ["ship", "*", "sources", "*", "lotId"])).toEqual([
      { at: "ship[0].sources[0].lotId", value: "a" },
      { at: "ship[0].sources[1].lotId", value: "b" },
      { at: "ship[1].sources[0].lotId", value: "c" },
    ]);
  });

  it("yields nothing for a value the input left out", () => {
    expect(valuesAt({}, ["note"])).toEqual([]);
    expect(valuesAt({ lines: [{}] }, ["lines", "*", "skuId"])).toEqual([]);
  });

  it("keeps a null or an empty array, because clearing a value is part of the proposal", () => {
    expect(valuesAt({ lotId: null }, ["lotId"])).toEqual([{ at: "lotId", value: null }]);
    expect(valuesAt({ quietHours: null }, ["quietHours", "start"])).toEqual([{ at: "quietHours", value: null }]);
    expect(valuesAt({ roles: [] }, ["roles", "*"])).toEqual([{ at: "roles", value: [] }]);
  });
});

describe("measureReadiness", () => {
  const tool = (over: Partial<ReadinessTool>): ReadinessTool => ({
    name: "fixture", kind: "query", description: "Read every open order at this brewery today", inputSchema: z.object({}), ...over,
  });

  // `note` has a description; `skuId` and `binId` are in the vocabulary; `id` has neither.
  // `qboItemId` is a command id field with no name to read, so it does not count as shown.
  it("counts each row of the scorecard", () => {
    expect(measureReadiness([
      tool({}),
      tool({ description: "Too short", inputSchema: z.object({ id: z.uuid(), note: z.string().describe("Why") }) }),
      tool({ kind: "command", compensation: "Reverse the movement", inputSchema: z.object({ skuId: z.uuid() }) }),
      tool({ kind: "command", compensation: null, inputSchema: z.object({ lines: z.array(z.object({ binId: z.uuid() })) }) }),
      tool({ kind: "command", compensation: null, inputSchema: z.object({ qboItemId: z.string() }) }),
    ])).toEqual({
      operations: 5, queries: 2, commands: 3, describedOperations: 4,
      fieldUses: 5, fieldUsesWithMeaning: 4, commandsWithUndo: 1, commandIdFieldUses: 3, commandIdFieldUsesNamed: 2,
    });
  });
});

// Raise a floor when a number improves. A drop means a new operation or field
// shipped without the meaning an agent needs.
const FLOORS = { describedOperations: 322, fieldUsesWithMeaning: 921, commandsWithUndo: 180, commandIdFieldUsesNamed: 325 };

it("never loses ground on the scorecard", () => {
  expect(measureReadiness(listTools())).toMatchObject(Object.fromEntries(
    Object.entries(FLOORS).map(([key, floor]) => [key, expect.toSatisfy((n: number) => n >= floor, `${key} at least ${floor}`)]),
  ));
});
