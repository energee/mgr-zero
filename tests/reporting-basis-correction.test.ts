import { describe, expect, it } from "vitest";
import { asUser, channelId, insertFixture, makeBrewery, makeCustomerUser, makeStaffCtx, seedCatalog, seedCustomer, seedLocation, sql } from "./helpers";
import { rawDatabase } from "./raw-database";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import type { Filing, Report } from "@/lib/commands/compliance";

const period = (month: string) => ({ jurisdiction: "TTB", periodStart: `2025-${month}-01`, periodEnd: `2025-${month}-${month === "02" ? "28" : "31"}` });
const can = (report: Report) => report.figures.lines.find(line => line.class === "can")!;

describe("recorded reporting-basis correction", () => {
  it("changes regenerated balances only through an admin correction, flags all dependent periods, preserves snapshots and immutable history", async () => {
    const breweryId = (await makeBrewery()).id;
    const ctx = await makeStaffCtx(breweryId);
    const { skuId } = await seedCatalog(breweryId, { packageType: "can", bblPerUnit: 0.5 });
    const loc = await seedLocation(breweryId);
    insertFixture("inventory_movements", { brewery_id: breweryId, sku_id: skuId, location_id: loc.id, bin_id: loc.binId, created_by: ctx.userId, qty: 10, type: "opening_balance", occurred_on: "2025-01-15" });
    await runCommand("set_books_opened_on", { booksOpenedOn: "2025-02-01" }, ctx);
    const feb = await runCommand("file_compliance_report", period("02"), ctx) as Filing;
    const march = await runCommand("file_compliance_report", period("03"), ctx) as Filing;
    const state = await runCommand("file_compliance_report", { ...period("02"), jurisdiction: "US-PA" }, ctx) as Filing;
    expect(can({ figures: feb.figures, warnings: [] }).begin).toBe(0);
    await expect(runCommand("set_books_opened_on", { booksOpenedOn: null }, ctx)).rejects.toThrow(/filed/);
    expect((await ctx.db.from("breweries").update({ books_opened_on: null }).eq("id", breweryId)).error).not.toBeNull();
    expect((await rawDatabase(ctx.db).from("report_filings").update({ figures: {} }).eq("id", feb.id)).error).not.toBeNull();
    expect(can(await runCommand("generate_compliance_report", period("02"), ctx) as Report).begin).toBe(0);

    const input = { booksOpenedOn: "2025-01-01", expectedBooksOpenedOn: "2025-02-01", reason: "Opening stock belongs in the reporting basis" };
    const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    const corrected = await runCommand("correct_reporting_basis", input, ctx, execution) as { id: string };
    expect(await runCommand("correct_reporting_basis", input, ctx, execution)).toEqual(corrected);
    expect(can(await runCommand("generate_compliance_report", period("02"), ctx) as Report).begin).toBe(5);
    expect(can(await runCommand("generate_compliance_report", period("03"), ctx) as Report).begin).toBe(5);
    const listed = await runCommand("list_compliance_reports", {}, ctx) as { filings: Filing[] };
    expect(listed.filings.map(f => [f.id, f.needs_amendment])).toEqual([[march.id, true], [feb.id, true], [state.id, true]]);
    const scoped = await runCommand("list_compliance_reports", { jurisdiction: "US-PA", periodStart: state.period_start, periodEnd: state.period_end }, ctx) as { filings: Filing[] };
    expect(scoped.filings).toHaveLength(1);
    expect(scoped.filings[0].basis_amendments?.[0]).toMatchObject({ correction_id: corrected.id, old_figures: state.figures });
    expect(listed.filings.find(f => f.id === feb.id)?.figures).toEqual(feb.figures);
    const history = await runCommand("list_reporting_basis_corrections", {}, ctx) as { id: string; old_basis: string; new_basis: string; corrected_by: string; corrected_at: string; reason: string }[];
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id: corrected.id, old_basis: "2025-02-01", new_basis: "2025-01-01", corrected_by: ctx.userId, reason: input.reason });
    expect(Date.parse(history[0].corrected_at)).not.toBeNaN();
    for (const table of ["reporting_basis_corrections", "report_basis_amendments"]) {
      expect((await rawDatabase(ctx.db).from(table).update({ brewery_id: breweryId }).eq("brewery_id", breweryId)).error).not.toBeNull();
      expect((await rawDatabase(ctx.db).from(table).delete().eq("brewery_id", breweryId)).error).not.toBeNull();
      expect((await rawDatabase(ctx.db).from(table).insert({ brewery_id: breweryId })).error).not.toBeNull();
      expect(() => sql(`update public.${table} set brewery_id=brewery_id where brewery_id='${breweryId}'`)).toThrow();
      expect(() => sql(`delete from public.${table} where brewery_id='${breweryId}'`)).toThrow();
    }
    await expect(runCommand("correct_reporting_basis", input, ctx)).rejects.toThrow(/changed|refresh/i);
    for (const role of ["sales", "warehouse", "brewer", "taproom"] as const) {
      const other = await makeStaffCtx(breweryId, role);
      await expect(runCommand("correct_reporting_basis", { ...input, expectedBooksOpenedOn: "2025-01-01", booksOpenedOn: null }, other)).rejects.toThrow();
      const denied = await rawDatabase(other.db).rpc("correct_reporting_basis", { p_brewery: breweryId, p_books_opened_on: null, p_expected_books_opened_on: "2025-01-01", p_reason: "Not authorized", p_request_id: crypto.randomUUID() });
      expect(denied.error).not.toBeNull();
      const rows = await rawDatabase(other.db).from("reporting_basis_corrections").select("*");
      expect(rows.error).toBeNull();
      expect(rows.data).toHaveLength(role === "sales" ? 1 : 0);
    }
    const outsider = await makeStaffCtx((await makeBrewery()).id);
    expect((await rawDatabase(outsider.db).from("reporting_basis_corrections").select("*").eq("brewery_id", breweryId)).data).toEqual([]);
    expect((await rawDatabase(outsider.db).rpc("correct_reporting_basis", { p_brewery: breweryId, p_books_opened_on: null, p_expected_books_opened_on: "2025-01-01", p_reason: "Foreign tenant", p_request_id: crypto.randomUUID() })).error).not.toBeNull();
    const customer = await seedCustomer(breweryId);
    const buyer = await makeCustomerUser(customer.customerId);
    const buyerDb = await asUser(buyer.email);
    expect((await rawDatabase(buyerDb).from("reporting_basis_corrections").select("*")).data).toEqual([]);
    expect((await rawDatabase(buyerDb).rpc("correct_reporting_basis", { p_brewery: breweryId, p_books_opened_on: null, p_expected_books_opened_on: "2025-01-01", p_reason: "Buyer", p_request_id: crypto.randomUUID() })).error).not.toBeNull();
    expect(sql("select has_function_privilege('anon', 'public.correct_reporting_basis(uuid,date,date,text,uuid)', 'execute')")).toEqual(["f"]);
  });

  it("records a no-balance-change correction without flagging unaffected filings, and flags periods invalidated by a later basis", async () => {
    const breweryId = (await makeBrewery()).id;
    const ctx = await makeStaffCtx(breweryId);
    await runCommand("set_books_opened_on", { booksOpenedOn: "2025-01-01" }, ctx);
    const filing = await runCommand("file_compliance_report", period("02"), ctx) as Filing;
    await runCommand("correct_reporting_basis", { expectedBooksOpenedOn: "2025-01-01", booksOpenedOn: null, reason: "Remove mistaken empty-history boundary" }, ctx);
    let listed = await runCommand("list_compliance_reports", {}, ctx) as { filings: Filing[] };
    expect(listed.filings[0]).toMatchObject({ id: filing.id, needs_amendment: false });
    await runCommand("correct_reporting_basis", { expectedBooksOpenedOn: null, booksOpenedOn: "2025-03-01", reason: "Correct opening date" }, ctx);
    listed = await runCommand("list_compliance_reports", {}, ctx) as { filings: Filing[] };
    expect(listed.filings[0].needs_amendment).toBe(true);
    await expect(runCommand("generate_compliance_report", period("02"), ctx)).rejects.toThrow(/books opened/);
    expect(listed.filings[0].figures).toEqual(filing.figures);
  });

  it("requires a filed period, changed basis and nonblank reason without leaving partial history", async () => {
    const breweryId = (await makeBrewery()).id;
    const ctx = await makeStaffCtx(breweryId);
    const input = { expectedBooksOpenedOn: null, booksOpenedOn: "2025-01-01", reason: "Verified correction" };
    await expect(runCommand("correct_reporting_basis", input, ctx)).rejects.toThrow(/no report has been filed/i);
    await runCommand("file_compliance_report", period("02"), ctx);
    await expect(runCommand("correct_reporting_basis", { ...input, booksOpenedOn: null }, ctx)).rejects.toThrow(/different reporting basis/);
    const blank = await rawDatabase(ctx.db).rpc("correct_reporting_basis", { p_brewery: breweryId, p_books_opened_on: "2025-01-01", p_expected_books_opened_on: null, p_reason: " ", p_request_id: crypto.randomUUID() });
    expect(blank.error?.message).toMatch(/reason is required/);
    expect(await runCommand("list_reporting_basis_corrections", {}, ctx)).toEqual([]);
    const brewery = await runCommand("get_brewery", {}, ctx) as { books_opened_on: string | null };
    expect(brewery.books_opened_on).toBeNull();
  });

  it("flags a changed destination-state report even when package balances stay identical", async () => {
    const breweryId = (await makeBrewery()).id;
    const ctx = await makeStaffCtx(breweryId);
    const { skuId } = await seedCatalog(breweryId, { packageType: "can", bblPerUnit: 0.5 });
    const loc = await seedLocation(breweryId);
    const channel = await channelId(breweryId, "Wholesale");
    const sale = crypto.randomUUID();
    const base = { brewery_id: breweryId, sku_id: skuId, location_id: loc.id, bin_id: loc.binId, created_by: ctx.userId };
    insertFixture("inventory_movements", [
      { ...base, type: "opening_balance", qty: 10, occurred_on: "2025-01-01" },
      { ...base, id: sale, type: "sale_removal", qty: -10, dest_state: "NY", sale_channel_id: channel, tax_treatment: "taxable", occurred_on: "2025-01-02" },
      { ...base, type: "return_in", qty: 1, source_movement_id: sale, occurred_on: "2025-02-02" },
    ].map(row => ({ id: crypto.randomUUID(), ...row })));
    await runCommand("set_books_opened_on", { booksOpenedOn: "2025-01-01" }, ctx);
    const filed = await runCommand("file_compliance_report", period("02"), ctx) as Filing;
    expect(filed.figures.stateTransactions).toEqual([expect.objectContaining({ state: "NY", kind: "return_in" })]);
    await runCommand("correct_reporting_basis", { expectedBooksOpenedOn: "2025-01-01", booksOpenedOn: "2025-02-01", reason: "Exclude prior-system activity" }, ctx);
    const regenerated = await runCommand("generate_compliance_report", period("02"), ctx) as Report;
    expect(regenerated.figures.lines).toEqual(filed.figures.lines);
    expect(regenerated.figures.stateTransactions).toEqual([expect.objectContaining({ state: "Unassigned", kind: "return_in" })]);
    const { filings } = await runCommand("list_compliance_reports", {}, ctx) as { filings: Filing[] };
    expect(filings[0].needs_amendment).toBe(true);
    expect(filings[0].figures).toEqual(filed.figures);
    expect(filings[0].basis_amendments?.[0].new_figures).toEqual(regenerated.figures);
  });

  it("reads the complete immutable history beyond the database's 1000-row response cap", async () => {
    const breweryId = (await makeBrewery()).id;
    const ctx = await makeStaffCtx(breweryId);
    sql(`insert into public.reporting_basis_corrections(brewery_id,old_basis,new_basis,corrected_by,reason)
      select '${breweryId}','2025-01-01','2025-02-01','${ctx.userId}','History fixture ' || n
      from generate_series(1,1001) n`, true);
    const history = await runCommand("list_reporting_basis_corrections", {}, ctx) as { id: string }[];
    expect(history).toHaveLength(1001);
    expect(new Set(history.map(row => row.id)).size).toBe(1001);
  });
});
