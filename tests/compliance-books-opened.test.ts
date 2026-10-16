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

  it.each([
    { opened: "2026-02-01", movement: "2026-01-01", start: "2026-02-01", end: "2026-02-28", begin: 0, nextStart: "2026-03-01", nextEnd: "2026-03-31", refused: [null, "2026-01-01"] },
    { opened: "2026-01-01", movement: "2026-02-01", start: "2026-03-01", end: "2026-03-31", begin: 5, nextStart: "2026-04-01", nextEnd: "2026-04-30", refused: ["2026-02-15", "2026-03-01", "2026-04-01"] },
  ])("preserves filed, regenerated and next-opening balances with books opened $opened", async (scenario) => {
    const breweryId = (await makeBrewery()).id;
    const ctx = await makeStaffCtx(breweryId);
    const { skuId } = await seedCatalog(breweryId, { packageType: "can", bblPerUnit: 0.5 });
    const loc = await seedLocation(breweryId);
    insertFixture("inventory_movements", {
      brewery_id: breweryId, sku_id: skuId, location_id: loc.id, bin_id: loc.binId,
      created_by: ctx.userId, qty: 10, type: "opening_balance", occurred_on: scenario.movement,
    });
    await runCommand("set_books_opened_on", { booksOpenedOn: scenario.opened }, ctx);
    const period = { jurisdiction: "TTB", periodStart: scenario.start, periodEnd: scenario.end };
    const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    const filed = await runCommand("file_compliance_report", period, ctx, execution) as { id: string; figures: Report["figures"] };
    expect(can({ figures: filed.figures, warnings: [] })).toMatchObject({ begin: scenario.begin, end: scenario.begin });

    for (const date of scenario.refused) {
      await expect(runCommand("set_books_opened_on", { booksOpenedOn: date }, ctx)).rejects.toThrow(/filed/);
    }
    const generated = await runCommand("generate_compliance_report", period, ctx) as Report;
    expect(generated.figures).toEqual(filed.figures);
    const listed = await runCommand("list_compliance_reports", period, ctx) as { filings: { id: string; figures: Report["figures"] }[]; booksOpenedOn: string };
    expect(listed.booksOpenedOn).toBe(scenario.opened);
    expect(listed.filings).toHaveLength(1);
    expect(listed.filings[0]).toMatchObject({ id: filed.id, figures: filed.figures });
    expect(await runCommand("file_compliance_report", period, ctx, execution)).toEqual(filed);
    const next = await runCommand("generate_compliance_report", {
      jurisdiction: "TTB", periodStart: scenario.nextStart, periodEnd: scenario.nextEnd,
    }, ctx) as Report;
    expect(can(next)).toMatchObject({ begin: scenario.begin, end: scenario.begin });
    expect(generated.warnings).toEqual([]);
    expect(next.warnings).toEqual([]);
  });
});
