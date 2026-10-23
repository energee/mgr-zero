// tests/compliance-activity.test.ts — list_compliance_reports names the recent
// periods (every cadence) holding anything the compliance report reads, so the
// Compliance list can mark an ended, unfiled, empty period No activity (#1209).
import { beforeAll, describe, expect, it } from "vitest";
import { insertFixture, makeBrewery, makeStaffCtx, seedCatalog, seedLocation } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import { periodRange, recentPeriods } from "@/lib/compliance-period";
import "@/lib/commands/all";

type Listed = { today: string; activePeriods: string[] };

let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let breweryId: string;
const list = () => runCommand("list_compliance_reports", {}, ctx) as Promise<Listed>;

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  ctx = await makeStaffCtx(breweryId);
});

describe("list_compliance_reports activePeriods", () => {
  it("is empty for a brewery with no ledger rows", async () => {
    expect((await list()).activePeriods).toEqual([]);
  });

  it("names the month, quarter and year of a movement, and not the empty month before it", async () => {
    const { today } = await list();
    const [, last, before] = recentPeriods(today, "month");
    const day = periodRange(last)!.periodStart;
    const { skuId } = await seedCatalog(breweryId, { packageType: "can", bblPerUnit: 0.5 });
    const loc = await seedLocation(breweryId);
    insertFixture("inventory_movements", {
      brewery_id: breweryId, sku_id: skuId, location_id: loc.id, bin_id: loc.binId,
      created_by: ctx.userId, qty: 4, type: "production_in", occurred_on: day,
    });
    const quarter = `${day.slice(0, 4)}-Q${Math.ceil(Number(day.slice(5, 7)) / 3)}`;
    const { activePeriods } = await list();
    expect(activePeriods).toEqual(expect.arrayContaining([last, quarter, day.slice(0, 4)]));
    expect(activePeriods).not.toContain(before);
  });
});
