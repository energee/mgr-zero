// tests/shared-pours.test.ts — a pour belongs to a price group and every beer on
// the group pours it, while what one beer does with it (sales, menu lines,
// Square variations) stays keyed by beer + pour. Covers the migration that
// moved brand-owned pours onto groups (20260927110000) and sale reconciliation.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { admin, channelId, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, seedPour, sql } from "./helpers";

const MIGRATION = "supabase/migrations/20260927110000_price_group_pours.sql";

// The migration's data section, between its backfill markers.
function backfillSection() {
  const text = readFileSync(MIGRATION, "utf8");
  const start = text.indexOf("-- backfill:begin"), end = text.indexOf("-- backfill:end");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
}

describe("price_group_pours migration backfill", () => {
  it("merges same-named pours on a group, repoints their references, and gives a groupless beer its own group", async () => {
    const brewery = await makeBrewery();
    const b = brewery.id;
    const location = await seedLocation(b, { name: "Taproom", uses: ["taproom"] });
    const channel = await channelId(b, "Taproom");
    const hazy = await seedCatalog(b, { product: "Hazy", sku: "Hazy half", packageType: "keg", bblPerUnit: 0.5 });
    const pils = await seedCatalog(b, { product: "Pils", sku: "Pils half", packageType: "keg", bblPerUnit: 0.5 });
    const solo = await seedCatalog(b, { product: "Solo", sku: "Solo half", packageType: "keg", bblPerUnit: 0.5 });
    const ids = Object.fromEntries(["group", "other", "conn", "menu", "hazyPint", "pilsPint", "pilsTaster", "soloPint"]
      .map((name) => [name, crypto.randomUUID()]));

    // Legacy shape: pours name a brand and no group, so the new checks are lifted
    // for this transaction and the whole thing rolls back.
    const out = sql(`begin;
      alter table public.formats drop constraint formats_poured_group_chk;
      drop index public.formats_poured_name_idx;
      alter table public.formats disable trigger formats_pour_owner;
      alter table public.pos_menu_lines drop constraint pos_menu_lines_pkey;
      alter table public.pos_menu_lines alter column brand_id drop not null;
      insert into public.price_groups(id, brewery_id, name, position) values
        ('${ids.group}', '${b}', 'Core', 1), ('${ids.other}', '${b}', 'Solo', 2);
      update public.brands set price_group_id = '${ids.group}' where id in ('${hazy.brandId}', '${pils.brandId}');
      insert into public.formats(id, brewery_id, name, basis, ounces, brand_id, created_at) values
        ('${ids.hazyPint}', '${b}', 'Pint', 'poured', 16, '${hazy.brandId}', now() - interval '2 days'),
        ('${ids.pilsPint}', '${b}', ' Pint', 'poured', 16, '${pils.brandId}', now() - interval '1 day'),
        ('${ids.pilsTaster}', '${b}', 'Taster', 'poured', 5, '${pils.brandId}', now()),
        ('${ids.soloPint}', '${b}', 'Pint', 'poured', 16, '${solo.brandId}', now());
      insert into public.channel_prices(brewery_id, sale_channel_id, price_group_id, format_id, unit_price_cents) values
        ('${b}', '${channel}', '${ids.group}', '${ids.hazyPint}', 700),
        ('${b}', '${channel}', '${ids.group}', '${ids.pilsPint}', 800),
        ('${b}', '${channel}', '${ids.group}', '${ids.pilsTaster}', 350),
        ('${b}', '${channel}', '${ids.other}', '${ids.hazyPint}', 999);
      insert into public.pos_connections(id, brewery_id, merchant_id, state, credential_version)
        values ('${ids.conn}', '${b}', 'merchant-${ids.conn}', 'connected', 1);
      insert into public.pos_locations(brewery_id, connection_id, external_location_id, location_id)
        values ('${b}', '${ids.conn}', 'L1', '${location.id}');
      insert into public.pos_menus(id, brewery_id, connection_id, external_location_id, location_id, bin_id, sale_channel_id)
        values ('${ids.menu}', '${b}', '${ids.conn}', 'L1', '${location.id}', '${location.binId}', '${channel}');
      insert into public.pos_menu_lines(menu_id, brewery_id, format_id, price_override_cents)
        values ('${ids.menu}', '${b}', '${ids.pilsPint}', 650);
      insert into public.pos_item_mappings(brewery_id, connection_id, external_item_id, external_variation_id, format_id)
        values ('${b}', '${ids.conn}', 'GUEST', 'GUEST-PINT', '${ids.pilsPint}');
      insert into public.pos_catalog_items(brewery_id, connection_id, brand_id, catalog_group, external_item_id, ownership)
        values ('${b}', '${ids.conn}', '${pils.brandId}', 'poured', 'PILS-ITEM', 'mgr');
      insert into public.pos_catalog_ownership(brewery_id, connection_id, brand_id, catalog_group, format_id, external_item_id, external_variation_id)
        values ('${b}', '${ids.conn}', '${pils.brandId}', 'poured', '${ids.pilsPint}', 'PILS-ITEM', 'PILS-PINT');
      ${backfillSection()}
      select 'pour|' || f.name || '|' || g.name || '|' || coalesce(f.brand_id::text, 'none') from public.formats f
        join public.price_groups g on g.id = f.price_group_id where f.brewery_id = '${b}' and f.basis = 'poured' order by 1;
      select 'solo|' || g.name from public.brands br join public.price_groups g on g.id = br.price_group_id where br.id = '${solo.brandId}';
      select 'price|' || g.name || '|' || f.name || '|' || cp.unit_price_cents from public.channel_prices cp
        join public.formats f on f.id = cp.format_id join public.price_groups g on g.id = cp.price_group_id
        where cp.brewery_id = '${b}' and f.basis = 'poured' order by 1;
      select 'line|' || (format_id = '${ids.hazyPint}') || '|' || (brand_id = '${pils.brandId}') || '|' || price_override_cents
        from public.pos_menu_lines where menu_id = '${ids.menu}';
      select 'mapping|' || (format_id = '${ids.hazyPint}') from public.pos_item_mappings where connection_id = '${ids.conn}';
      select 'owner|' || (format_id = '${ids.hazyPint}') || '|' || (brand_id = '${pils.brandId}') from public.pos_catalog_ownership where connection_id = '${ids.conn}';
      rollback;`, true);

    expect(out).toEqual([
      // The older Hazy "Pint" survives for the whole group; Pils's " Pint" merges into it.
      "pour|Pint|Core|none",
      // Solo had no group: it gets its own, named after it (with its id, because "Solo" was taken).
      expect.stringMatching(/^pour\|Pint\|Solo \([0-9a-f]{8}\)\|none$/),
      "pour|Taster|Core|none",
      expect.stringMatching(/^solo\|Solo \([0-9a-f]{8}\)$/),
      // The survivor's own price wins the merge; a price on a group that does not own the pour is dropped.
      "price|Core|Pint|700",
      "price|Core|Taster|350",
      // Pils's override now sits on the merged pour, still for Pils.
      "line|true|true|650",
      "mapping|true",
      "owner|true|true",
    ]);
  });
});

describe("reconcile_pos_sale on a shared pour", () => {
  // A Square variation mapped by hand (not an MGR-published item) to a pour
  // two beers share: the sale is charged to the beer on tap, never guessed.
  async function sharedPourSale() {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const location = await seedLocation(brewery.id, { name: "Taproom", uses: ["taproom"] });
    const hazy = await seedCatalog(brewery.id, { product: "Hazy", sku: "Hazy half", packageType: "keg", bblPerUnit: 0.5 });
    const pintId = await seedPour(brewery.id, { brandId: hazy.brandId, name: "Pint", ounces: 16 });
    const group = (await admin.from("brands").select("price_group_id").eq("id", hazy.brandId).single()).data!.price_group_id as string;
    const pils = await seedCatalog(brewery.id, { product: "Pils", sku: "Pils half", packageType: "keg", bblPerUnit: 0.5, priceGroupId: group });
    const connection = crypto.randomUUID();
    sql(`insert into public.pos_connections(id, brewery_id, merchant_id, state, credential_version)
        values ('${connection}', '${brewery.id}', 'merchant-${connection}', 'connected', 1);
      insert into public.pos_locations(brewery_id, connection_id, external_location_id, location_id)
        values ('${brewery.id}', '${connection}', 'L1', '${location.id}');
      insert into public.pos_item_mappings(brewery_id, connection_id, external_item_id, external_variation_id, format_id)
        values ('${brewery.id}', '${connection}', 'GUEST', 'GUEST-PINT', '${pintId}');`);
    const reconcile = () => {
      const sale = crypto.randomUUID();
      const reconciled = sql(`insert into public.pos_sales(id, brewery_id, connection_id, external_order_id, external_line_id,
          external_item_id, external_variation_id, external_location_id, sold_at, qty)
        values ('${sale}', '${brewery.id}', '${connection}', 'O-${sale}', 'L', 'GUEST', 'GUEST-PINT', 'L1', now(), 1);
        select private.reconcile_pos_sale('${brewery.id}', '${sale}');`, true);
      const brand = sql(`select brand_id from public.pos_sale_expectations where sale_id = '${sale}'`, true);
      return { reconciled: reconciled[0], brand: brand[0] ?? null };
    };
    const tap = (skuId: string) => sql(`insert into public.tap_intervals(brewery_id, location_id, tap_number, sku_id, nominal_bbl,
        opening_fill, not_in_inventory, opened_at, opened_by)
      values ('${brewery.id}', '${location.id}', '1', '${skuId}', 0.5, 1, false, now() - interval '1 hour', '${ctx.userId}')`);
    return { hazy, pils, reconcile, tap };
  }

  it("charges the beer on tap", async () => {
    const f = await sharedPourSale();
    f.tap(f.pils.skuId);
    expect(f.reconcile()).toEqual({ reconciled: "t", brand: f.pils.brandId });
  });

  it("leaves the sale unreconciled when no beer on the group is on tap", async () => {
    const f = await sharedPourSale();
    expect(f.reconcile()).toEqual({ reconciled: "f", brand: null });
  });
});
