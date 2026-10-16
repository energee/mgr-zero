// Material stock must remain complete at and beyond PostgREST's row cap.
import { expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedLocation, seedMaterial, seedMovement } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Stock = { material_id: string; location_id: string; bin_id: string; qty: number };

it.each([999, 1000, 1001])("returns exact material/bin balances across %i stock buckets, scoped to tenant and location", async bucketCount => {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "warehouse");
  const locations = [await seedLocation(brewery.id, { name: "Receiving" }), await seedLocation(brewery.id, { name: "Storage" })];
  const materials = Array.from({ length: Math.ceil(bucketCount / 10) }, () => crypto.randomUUID()).sort();
  const bins = Array.from({ length: 10 }, (_, n) => ({ id: crypto.randomUUID(), location_id: locations[n % 2].id, brewery_id: brewery.id, name: `Stock bin ${n}` }));
  const definitions = await admin.from("materials").insert(materials.map((id, n) => ({
    id, brewery_id: brewery.id, name: `Material ${n}`, category: "packaging" as const, base_uom: "each" as const, purchase_uom: "each" as const,
  })));
  if (definitions.error) throw definitions.error;
  const binInsert = await admin.from("bins").insert(bins);
  if (binInsert.error) throw binInsert.error;
  const expected = Array.from({ length: bucketCount }, (_, n): Stock => ({
    material_id: materials[Math.floor(n / 10)], location_id: bins[n % 10].location_id,
    bin_id: bins[n % 10].id, qty: n % 3 + 1,
  }));
  const movements = await admin.from("material_movements").insert(expected.map(row => ({ ...row, brewery_id: brewery.id, type: "opening_balance" as const, created_by: ctx.userId })));
  if (movements.error) throw movements.error;

  const foreign = await makeBrewery();
  const foreignLocation = await seedLocation(foreign.id);
  const foreignMaterial = await seedMaterial(foreign.id, { name: "Other tenant stock", category: "packaging", uom: "each" });
  await seedMovement(foreign.id, { materialId: foreignMaterial, locationId: foreignLocation.id, binId: foreignLocation.binId, qty: 100, createdBy: ctx.userId });

  // Compare complete grain and quantity, not just a count that duplicates could satisfy.
  const byGrain = (rows: Stock[]) => rows.map(row => [row.material_id, row.location_id, row.bin_id, Number(row.qty)].join(":")).sort();
  const all = await runCommand("get_material_on_hand", {}, ctx) as Stock[];
  expect(byGrain(all)).toEqual(byGrain(expected));
  const selected = await runCommand("get_material_on_hand", { locationId: locations[1].id }, ctx) as Stock[];
  expect(byGrain(selected)).toEqual(byGrain(expected.filter(row => row.location_id === locations[1].id)));
  expect(await runCommand("get_material_on_hand", { locationId: foreignLocation.id }, ctx)).toEqual([]);
});
