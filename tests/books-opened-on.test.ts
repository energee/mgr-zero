// tests/books-opened-on.test.ts — the brewery's books-opened date
// (docs/plans/lolev-history.md, tasks 1–2): the day the ledger starts counting
// for compliance. Admin-only; null by default; fixed after any filed snapshot
// so changing or clearing it cannot change that snapshot's reporting basis.
import { beforeAll, describe, expect, it } from "vitest";
import { makeBrewery, makeStaffCtx, sql } from "./helpers";
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

  it("freezes every change after filing, but permits the same value and exact request replay", async () => {
    const requestId = crypto.randomUUID();
    const execution = { requestId, correlationId: crypto.randomUUID() };
    const original = await runCommand("set_books_opened_on", { booksOpenedOn: "2026-01-01" }, adminCtx, execution);
    await runCommand("set_books_opened_on", { booksOpenedOn: "2026-02-01" }, adminCtx);
    await runCommand("file_compliance_report", {
      jurisdiction: "TTB", periodStart: "2026-03-01", periodEnd: "2026-03-31",
    }, adminCtx);
    for (const date of [null, "2026-01-01", "2026-02-15", "2026-03-01", "2026-04-01"]) {
      await expect(runCommand("set_books_opened_on", { booksOpenedOn: date }, adminCtx)).rejects.toThrow(/cannot change or be cleared.*filed.*compliance owner/);
      expect(await booksOpenedOn()).toBe("2026-02-01");
    }
    expect(await runCommand("set_books_opened_on", { booksOpenedOn: "2026-02-01" }, adminCtx))
      .toEqual({ books_opened_on: "2026-02-01" });
    // The old request returns its original receipt, never overwrites the later saved basis.
    expect(await runCommand("set_books_opened_on", { booksOpenedOn: "2026-01-01" }, adminCtx, execution)).toEqual(original);
    expect(await booksOpenedOn()).toBe("2026-02-01");
    await expect(runCommand("set_books_opened_on", { booksOpenedOn: null }, adminCtx, execution)).rejects.toThrow(/different payload/);
    expect(sql(`select count(*) from private.command_requests where request_id='${requestId}'`, true)).toEqual(["1"]);
  });

  it("also freezes an unset basis and allows an unchanged null", async () => {
    const fresh = await makeStaffCtx((await makeBrewery()).id);
    await runCommand("file_compliance_report", {
      jurisdiction: "TTB", periodStart: "2026-02-01", periodEnd: "2026-02-28",
    }, fresh);
    await expect(runCommand("set_books_opened_on", { booksOpenedOn: "2026-02-01" }, fresh)).rejects.toThrow(/filed/);
    expect(await runCommand("set_books_opened_on", { booksOpenedOn: null }, fresh)).toEqual({ books_opened_on: null });
  });

  it("keeps database admin and tenant authority on direct RPC calls", async () => {
    const input = { p_brewery: breweryId, p_books_opened_on: "2026-02-01", p_request_id: crypto.randomUUID() };
    expect((await brewerCtx.db.rpc("set_brewery_books_opened_on", input)).error).not.toBeNull();
    const outsider = await makeStaffCtx((await makeBrewery()).id);
    expect((await outsider.db.rpc("set_brewery_books_opened_on", { ...input, p_request_id: crypto.randomUUID() })).error).not.toBeNull();
    expect(await booksOpenedOn()).toBe("2026-02-01");
  });
});
