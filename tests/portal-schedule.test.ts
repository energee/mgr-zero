// tests/portal-schedule.test.ts — portal_schedule (issue #278, Coming up): a
// buyer sees planned batches of their brewery as brand + expected week and
// whether the brand is on their list, nothing else; batches itself stays
// unreadable to customers.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, asUser, makeBrewery, makeCustomerUser, makeStaff, priceSku, seedCatalog, seedCustomer } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let custCtx: { db: Awaited<ReturnType<typeof asUser>>; userId: string; breweryId: string; role: "customer"; customerId: string };
let hazy: string, saison: string;

async function planBatches(breweryId: string, rows: { brand: string | null; plannedOn: string; brewedOn?: string }[]) {
  const staff = await makeStaff(breweryId, "brewer");
  const { error } = await admin.from("batches").insert(rows.map((r) => ({ brewery_id: breweryId, intended_brand_id: r.brand, planned_on: r.plannedOn, planned_bbl: 20, brewed_on: r.brewedOn ?? null, created_by: staff.id })));
  if (error) throw error;
}

beforeAll(async () => {
  const b = await makeBrewery();
  const hazyCat = await seedCatalog(b.id, { product: "Hazy IPA" });
  hazy = hazyCat.brandId;
  saison = (await seedCatalog(b.id, { product: "Saison" })).brandId;
  const { customerId, saleChannelId } = await seedCustomer(b.id);
  await priceSku(b.id, { saleChannelId, brandId: hazy, formatId: hazyCat.formatId, cents: 3600 });
  await planBatches(b.id, [
    { brand: hazy, plannedOn: "2026-09-16" },                        // Wednesday → week of Monday 2026-09-14
    { brand: saison, plannedOn: "2026-10-07" },                      // priced for no channel: not yet listed
    { brand: hazy, plannedOn: "2026-09-02", brewedOn: "2026-09-02" }, // brewed: not upcoming
    { brand: null, plannedOn: "2026-09-23" },                        // no brand yet: nothing to show a buyer
  ]);
  const other = await makeBrewery();
  await planBatches(other.id, [{ brand: (await seedCatalog(other.id, { product: "Elsewhere" })).brandId, plannedOn: "2026-09-16" }]);
  const user = await makeCustomerUser(customerId);
  custCtx = { db: await asUser(user.email), userId: user.id, breweryId: b.id, role: "customer", customerId };
});

describe("portal_schedule", () => {
  it("lists planned batches as brand, week and listed, soonest first, and nothing more", async () => {
    expect(await runCommand("portal_schedule", {}, custCtx)).toEqual([
      { brand_id: hazy, brand_name: "Hazy IPA", planned_week: "2026-09-14", listed: true },
      { brand_id: saison, brand_name: "Saison", planned_week: "2026-10-05", listed: false },
    ]);
  });
  it("leaves batches unreadable to the customer", async () => {
    const { data } = await custCtx.db.from("batches").select("id");
    expect(data).toEqual([]);
  });
});
