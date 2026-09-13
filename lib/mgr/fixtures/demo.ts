// lib/mgr/fixtures/demo.ts — the one Demo Brewing cast the screen inventory
// threads through order views. Command snapshots in fixtures/orders.ts
// reference these ids and labels so Ridgeline cannot be two customers.
export const LOC_WAREHOUSE = { id: "00000000-0000-4000-8000-000000000001", name: "Warehouse" };
export const LOC_TAPROOM = { id: "00000000-0000-4000-8000-000000000002", name: "Taproom" };
export const LOCATIONS = [LOC_WAREHOUSE, LOC_TAPROOM];

export const ALS = {
  name: "Al’s Bar",
  shipTo: { label: "Main", city: "Columbus", state: "OH" },
} as const;

export const RIDGELINE = {
  name: "Ridgeline Tap Room",
  shipTos: ["Main · Phoenixville, PA", "Dock"],
} as const;

export const TERESA = { name: "Teresa’s" } as const;

export const SKU_HAZY = {
  sku_id: "00000000-0000-4000-8000-0000000000a1",
  name: "Hazy IPA · ½ bbl keg",
  unit_price_cents: 15000,
} as const;

export const SKU_PILS = {
  sku_id: "00000000-0000-4000-8000-0000000000a2",
  name: "Pils · 16 oz case",
  unit_price_cents: 3800,
} as const;

export const SKU_STOUT = {
  sku_id: "00000000-0000-4000-8000-0000000000a3",
  name: "Stout · ⅙ bbl keg",
  unit_price_cents: 0,
} as const;

/** Inventory-only until confirm reads the compliance registry. */
export const OHIO_STOUT_NOTE = "Stout isn’t registered for Ohio. Add the registration on the Stout brand.";
