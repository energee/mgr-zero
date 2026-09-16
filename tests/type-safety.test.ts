// Type boundaries must reject misspelled tables/arguments and preserve row types.
import { expect, expectTypeOf, it } from "vitest";
import { toJson } from "@/lib/supabase/json";
import type { Ctx } from "@/lib/commands/registry";

it("keeps database rows typed through the command context", () => {
  // Never executed: tsc checks this function, including its negative assertions.
  const check = async (db: Ctx["db"]) => {
    const result = await db.from("brands").select("id, name").single();
    expectTypeOf(result.data).not.toBeAny();
    if (result.data) {
      expectTypeOf(result.data.name).toEqualTypeOf<string>();
      // @ts-expect-error only selected columns are available
      void result.data.missing_column;
    }
    // @ts-expect-error table names come from the migration schema
    db.from("not_a_real_table");
    // @ts-expect-error RPC names come from the migration schema
    db.rpc("not_a_real_function", {});
    // @ts-expect-error RPC argument names are checked
    db.rpc("delete_customer", { misspelled: "id" });
  };
  expectTypeOf(check).toBeFunction();
});

it("normalizes provider JSON without inventing values", () => {
  expect(toJson({ amount: "0.00000001", absent: undefined, nullable: null })).toEqual({ amount: "0.00000001", nullable: null });
  expect(() => toJson(undefined)).toThrow("Expected a JSON value");
  expect(() => toJson({ unsupported: BigInt(1) })).toThrow();
});
