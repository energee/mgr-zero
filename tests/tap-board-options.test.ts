import { expect, it } from "vitest";
import { makeBrewery, makeStaffCtx, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

it("loads every own keg SKU and taproom location for the Taproom board beyond the API row cap", async () => {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "taproom");
  sql(`with f as (
    insert into public.formats(brewery_id,name,basis,package_type,keg_size,bbl_per_unit)
    select '${brewery.id}','Keg format '||n,'packaged','keg','half_bbl',.5 from generate_series(1,1001) n returning id,name
  ), b as (
    insert into public.brands(brewery_id,name) select '${brewery.id}','Brand '||n from generate_series(1,1001) n returning id,name
  ) insert into public.skus(brewery_id,brand_id,format_id,name)
    select '${brewery.id}',b.id,f.id,'Board keg '||row_number() over(order by b.name) from b join f on replace(b.name,'Brand ','')=replace(f.name,'Keg format ','');
    insert into public.locations(brewery_id,name,kind)
    select '${brewery.id}','Taproom '||n,'taproom' from generate_series(1,1001) n`);

  const [skus, locations] = await Promise.all([
    runCommand("list_skus", {}, ctx) as Promise<{ id: string }[]>,
    runCommand("list_locations", {}, ctx) as Promise<{ id: string; kind: string }[]>,
  ]);
  expect(skus).toHaveLength(1001);
  expect(locations.filter((location) => location.kind === "taproom")).toHaveLength(1001);
});
