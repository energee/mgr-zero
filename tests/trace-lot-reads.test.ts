// tests/trace-lot-reads.test.ts — trace_lot starts its lot read and its
// source, movement and ingredient reads together (#1491): all four need only
// the lot id, so none waits on another. A fake client records what is asked
// for while the lot read is held open.
import { describe, expect, it } from "vitest";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";

const lotId = crypto.randomUUID();
const lot = { id: lotId, code: "L1", packaged_on: "2026-10-01", best_by: null, brands: null, packaging_runs: null };

function fakeDb(lotRead: Promise<unknown>, asked: string[]) {
  const query = (table: string) => {
    const result = table === "lots" ? lotRead : Promise.resolve({ data: [], error: null, count: 0 });
    const chain: object = new Proxy({}, {
      get: (_, key) => key === "then" ? result.then.bind(result) : () => chain,
    });
    return chain;
  };
  return {
    from: (table: string) => { asked.push(table); return query(table); },
    rpc: (name: string) => { asked.push(name); return Promise.resolve({ data: name === "trace_lot_sources" ? {} : [], error: null }); },
  };
}

describe("trace_lot reads", () => {
  it("asks for sources, movements and ingredients before the lot read returns", async () => {
    const asked: string[] = [];
    let release!: (value: unknown) => void;
    const lotRead = new Promise(resolve => { release = resolve; });
    const ctx = { db: fakeDb(lotRead, asked), userId: crypto.randomUUID(), breweryId: crypto.randomUUID(), roles: ["admin"] } as unknown as Ctx;
    const trace = runCommand("trace_lot", { lotId }, ctx);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(asked).toEqual(expect.arrayContaining(["lots", "trace_lot_sources", "inventory_movements", "trace_lot_ingredients"]));
    release({ data: lot, error: null });
    await expect(trace).resolves.toMatchObject({ lot: { id: lotId, code: "L1" } });
  });
});
