// tests/compliance-books-opened.test.ts — the compliance report starts
// counting at breweries.books_opened_on (docs/plans/lolev-history.md task 3).
// Ledger rows dated before it — imported history — change no line, balance,
// removal or packaged total; a period that starts before it is refused, so a
// report never mixes counted and uncounted rows; with no date, nothing changes.
import { beforeAll, describe, expect, it } from "vitest";
import { channelId, insertFixture, makeBrewery, makeStaffCtx, seedCatalog, seedLocation } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Line = { class: string; begin: number; in: number; out: number; end: number };
type Report = { figures: { lines: Line[]; packaged: number; balances: boolean }; warnings: string[] };

const OCT = { jurisdiction: "TTB", periodStart: "2026-10-01", periodEnd: "2026-10-31" };
const can = (r: Report) => r.figures.lines.find((l) => l.class === "can")!;

let owner: Awaited<ReturnType<typeof makeStaffCtx>>;

beforeAll(async () => {
  const breweryId = (await makeBrewery()).id;
  owner = await makeStaffCtx(breweryId);
  const { skuId } = await seedCatalog(breweryId, { packageType: "can", bblPerUnit: 0.5 });
  const loc = await seedLocation(breweryId);
  const taproom = await channelId(breweryId, "Taproom");
  const base = { brewery_id: breweryId, sku_id: skuId, location_id: loc.id, bin_id: loc.binId, created_by: owner.userId };
  insertFixture("inventory_movements", [
    // Go-live stock and October's activity: the rows a real report counts.
    { ...base, qty: 10, type: "opening_balance", occurred_on: "2026-10-01" },
    { ...base, qty: 4, type: "production_in", occurred_on: "2026-10-05" },
    // History: a lot packaged and sold through in 2025, and one that never netted to zero.
    { ...base, qty: 6, type: "production_in", occurred_on: "2025-06-01" },
    { ...base, qty: -6, type: "depletion", sale_channel_id: taproom, tax_treatment: "taxable", occurred_on: "2025-06-01" },
    { ...base, qty: 3, type: "production_in", occurred_on: "2025-07-01" },
  ]);
});

const october = () => runCommand("generate_compliance_report", OCT, owner) as Promise<Report>;
const setBooks = (date: string | null) => runCommand("set_books_opened_on", { booksOpenedOn: date }, owner);

describe("compliance report and books_opened_on", () => {
  it("with no date, history enters the beginning balance (today's behavior)", async () => {
    expect(can(await october())).toMatchObject({ begin: 1.5, in: 7, end: 8.5 });
  });

  it("from books_opened_on, history changes no line, packaged total or warning", async () => {
    await setBooks("2026-10-01");
    const r = await october();
    expect(can(r)).toMatchObject({ begin: 0, in: 7, out: 0, end: 7 });
    expect(r.figures.packaged).toBe(2);
    expect(r.figures.balances).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("refuses a period that starts before books opened", async () => {
    await expect(runCommand("generate_compliance_report", { jurisdiction: "TTB", periodStart: "2026-09-01", periodEnd: "2026-09-30" }, owner))
      .rejects.toThrow(/books opened/);
  });

  it("clearing the date restores today's behavior", async () => {
    await setBooks(null);
    expect(can(await october())).toMatchObject({ begin: 1.5, in: 7, end: 8.5 });
  });
});
