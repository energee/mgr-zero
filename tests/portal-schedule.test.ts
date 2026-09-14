// tests/portal-schedule.test.ts — portal_schedule (issue #278, Coming up): a
// buyer sees planned batches of their brewery as brand + expected week and
// nothing else; batches itself stays unreadable to customers.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, asUser, makeBrewery, makeCustomerUser, makeStaff, seedCatalog, seedCustomer } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let custCtx: { db: Awaited<ReturnType<typeof asUser>>; userId: string; breweryId: string; role: "customer"; customerId: string };
let brandId: string;

async function planBatch(breweryId: string, brand: string | null, plannedOn: string, brewedOn: string | null = null) {
  const staff = await makeStaff(breweryId, "brewer");
  const { error } = await admin.from("batches").insert({ brewery_id: breweryId, intended_brand_id: brand, planned_on: plannedOn, planned_bbl: 20, brewed_on: brewedOn, created_by: staff.id });
  if (error) throw error;
}

beforeAll(async () => {
  const b = await makeBrewery();
  ({ brandId } = await seedCatalog(b.id, { product: "Hazy IPA" }));
  const { customerId } = await seedCustomer(b.id);
  await planBatch(b.id, brandId, "2026-09-16");            // Wednesday → week of Monday 2026-09-14
  await planBatch(b.id, brandId, "2026-09-02", "2026-09-02"); // brewed: not upcoming
  await planBatch(b.id, null, "2026-09-23");                // no brand yet: nothing to show a buyer
  const other = await makeBrewery();
  await planBatch(other.id, (await seedCatalog(other.id, { product: "Elsewhere" })).brandId, "2026-09-16");
  const user = await makeCustomerUser(customerId);
  custCtx = { db: await asUser(user.email), userId: user.id, breweryId: b.id, role: "customer", customerId };
});

describe("portal_schedule", () => {
  it("lists planned batches as brand and week, soonest first, and nothing more", async () => {
    const rows = await runCommand("portal_schedule", {}, custCtx);
    expect(rows).toEqual([{ brand_id: brandId, brand_name: "Hazy IPA", planned_week: "2026-09-14" }]);
  });
  it("leaves batches unreadable to the customer", async () => {
    const { data } = await custCtx.db.from("batches").select("id");
    expect(data).toEqual([]);
  });
});
