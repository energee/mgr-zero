// tests/books-opened-on.test.ts — the brewery's books-opened date
// (docs/plans/lolev-history.md, tasks 1–2): the day the ledger starts counting
// for compliance. Admin-only; null by default; and it cannot move past the
// start of a period already filed, because that filing's beginning balance
// was computed from rows the new date would hide.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let breweryId: string;
let adminCtx: Awaited<ReturnType<typeof makeStaffCtx>>;
let brewerCtx: Awaited<ReturnType<typeof makeStaffCtx>>;

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  adminCtx = await makeStaffCtx(breweryId, "admin");
  brewerCtx = await makeStaffCtx(breweryId, "brewer");
});

const booksOpenedOn = async () => ((await runCommand("get_brewery", {}, brewerCtx)) as { books_opened_on: string | null }).books_opened_on;

describe("books opened on", () => {
  it("starts unset", async () => {
    expect(await booksOpenedOn()).toBeNull();
  });

  it("an admin sets it and staff read it back", async () => {
    await runCommand("set_books_opened_on", { booksOpenedOn: "2026-10-01" }, adminCtx);
    expect(await booksOpenedOn()).toBe("2026-10-01");
  });

  it("an admin can clear it", async () => {
    await runCommand("set_books_opened_on", { booksOpenedOn: null }, adminCtx);
    expect(await booksOpenedOn()).toBeNull();
  });

  it("refuses a non-admin", async () => {
    await expect(runCommand("set_books_opened_on", { booksOpenedOn: "2026-10-01" }, brewerCtx)).rejects.toThrow(/permission denied/);
  });

  it("refuses a date after the start of a filed period, and allows one on or before it", async () => {
    const { error } = await admin.from("report_filings").insert({
      brewery_id: breweryId, jurisdiction: "TTB", period_start: "2026-09-01", period_end: "2026-09-30",
      figures: {}, filed_at: new Date().toISOString(),
    });
    if (error) throw error;
    await expect(runCommand("set_books_opened_on", { booksOpenedOn: "2026-09-15" }, adminCtx)).rejects.toThrow(/filed/);
    await runCommand("set_books_opened_on", { booksOpenedOn: "2026-09-01" }, adminCtx);
    expect(await booksOpenedOn()).toBe("2026-09-01");
  });
});
