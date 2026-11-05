// tests/agent-readiness.test.ts — the readiness scorecard in docs/plans/agent-access.md.
// The counts must be right on a small fixture, and the real numbers can only go up.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import "@/lib/commands/all";
import { listTools } from "@/lib/commands/registry";
import { measureReadiness, type ReadinessTool } from "@/lib/mgr/agent-readiness";
import { leafFields } from "@/lib/mgr/api-schema";

describe("leafFields", () => {
  it("reaches nested fields and sees a description on any wrapper", () => {
    const schema = z.object({
      orderId: z.uuid().describe("The order"),
      note: z.string().optional().describe("A note"),
      lines: z.array(z.object({ skuId: z.uuid(), qty: z.number() })),
    });
    expect(leafFields(schema)).toEqual([
      { name: "orderId", described: true },
      { name: "note", described: true },
      { name: "skuId", described: false },
      { name: "qty", described: false },
    ]);
  });

  it("reads each object in a union, and treats a union of values as one field", () => {
    expect(leafFields(z.union([z.object({ a: z.string() }), z.object({ b: z.string() })])).map(f => f.name)).toEqual(["a", "b"]);
    expect(leafFields(z.object({ when: z.union([z.string(), z.number()]) })).map(f => f.name)).toEqual(["when"]);
  });
});

describe("measureReadiness", () => {
  const tool = (over: Partial<ReadinessTool>): ReadinessTool => ({
    kind: "query", description: "Read every open order at this brewery today", inputSchema: z.object({}), ...over,
  });

  it("counts each row of the scorecard", () => {
    expect(measureReadiness([
      tool({}),
      tool({ description: "Too short", inputSchema: z.object({ id: z.uuid(), note: z.string().describe("Why") }) }),
      tool({ kind: "command", compensation: "Reverse the movement", inputSchema: z.object({ skuId: z.uuid() }) }),
      tool({ kind: "command", compensation: null, inputSchema: z.object({ lines: z.array(z.object({ binId: z.uuid() })) }) }),
    ])).toEqual({
      operations: 4, queries: 2, commands: 2, describedOperations: 3,
      fieldUses: 4, fieldUsesWithMeaning: 1, commandsWithUndo: 1, commandIdFieldUses: 2,
    });
  });
});

// Raise a floor when a number improves. A drop means a new operation or field
// shipped without the meaning an agent needs.
const FLOORS = { describedOperations: 301, fieldUsesWithMeaning: 41, commandsWithUndo: 1 };

it("never loses ground on the scorecard", () => {
  expect(measureReadiness(listTools())).toMatchObject(Object.fromEntries(
    Object.entries(FLOORS).map(([key, floor]) => [key, expect.toSatisfy((n: number) => n >= floor, `${key} at least ${floor}`)]),
  ));
});
