// tests/stock-transfers.test.ts — a stock transfer is a document between two
// locations (spec 2026-09-06 Decision 3), never a third order kind; a move
// inside one location is move_stock_bin and writes no document.
import { describe, it, expect } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedLocation } from "./helpers";
import "@/lib/commands/all";

describe("stock_transfers schema", () => {
  it("rejects a transfer whose from and to location are equal", async () => {
    const b = await makeBrewery();
    const ctx = await makeStaffCtx(b.id, "admin");
    const from = await seedLocation(b.id, { name: "WH", kind: "warehouse" });
    const { error } = await admin.from("stock_transfers").insert({
      brewery_id: b.id, from_location_id: from.id, to_location_id: from.id, created_by: ctx.userId,
    });
    expect(error).not.toBeNull(); // check (to_location_id <> from_location_id)
    expect(error?.code).not.toBe("PGRST205"); // the table exists
  });
});
