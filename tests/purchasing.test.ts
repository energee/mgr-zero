// tests/purchasing.test.ts — Program 6: vendors, materials, contracts, POs
// (draft → mark sent → receive), planning drafts, and material cycle counts.
// Lead time lives on the vendor (spec 2026-09-07 §3); a PO status is derived
// from counted receipts and an empty PO never looks received (§2).
import { describe, expect, it } from "vitest";
import { sql } from "./helpers";
import "@/lib/commands/all";

describe("schema: lead time and PO status derivation", () => {
  it("lead_time_days lives on vendors; materials has no such column", () => {
    const col = (t: string) => sql(`select column_name from information_schema.columns
      where table_schema='public' and table_name='${t}' and column_name='lead_time_days'`);
    expect(col("vendors")).toEqual(["lead_time_days"]);
    expect(col("materials")).toEqual([]);
  });

  it("a PO with no lines derives no status (the trigger leaves it alone)", () => {
    // bool_and over zero rows is NULL; before the guard that read as partially_received.
    expect(sql(`select private.po_receipt_status('00000000-0000-4000-8000-000000000000'::uuid) is null`)).toEqual(["t"]);
  });
});
