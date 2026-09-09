import { expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { makeBrewery, makeStaffCtx, sql } from "./helpers";
import { admin } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import { readServerEnv } from "@/lib/env/server-parser";
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
    runCommand("list_skus", {}, ctx) as Promise<{ id: string; name: string }[]>,
    runCommand("list_locations", {}, ctx) as Promise<{ id: string; name: string; kind: string }[]>,
  ]);
  expect(skus).toHaveLength(1001);
  expect(locations.filter((location) => location.kind === "taproom")).toHaveLength(1001);
  expect(skus.map((row) => row.name)).toEqual(skus.map((row) => row.name).sort((a, b) => a.localeCompare(b)));
  expect(locations.map((row) => row.name)).toEqual(locations.map((row) => row.name).sort((a, b) => a.localeCompare(b)));
});

it("keeps every location identity when a location is renamed between pages, then sorts the result alphabetically", async () => {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "taproom");
  sql(`insert into public.locations(brewery_id,name,kind)
    select '${brewery.id}','Mutable taproom '||lpad(n::text,4,'0'),'taproom' from generate_series(1,1001) n`);
  const expectedIds = sql(`select id from public.locations where brewery_id='${brewery.id}' order by id`);
  const target = (await admin.from("locations").select("id").eq("brewery_id", brewery.id)
    .order("name").order("id").range(700, 700).single()).data!;
  const env = readServerEnv();
  let renamed = false;
  const racingDb = createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false },
    global: { fetch: async (input, init) => {
      const response = await fetch(input, init);
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!renamed && url.includes("/rest/v1/locations?")) {
        renamed = true;
        const result = await admin.from("locations").update({ name: "Mutable taproom 0000" }).eq("id", target.id);
        if (result.error) throw result.error;
      }
      return response;
    } },
  });
  const rows = await runCommand("list_locations", {}, { ...ctx, db: racingDb }) as { id: string; name: string }[];

  expect(renamed).toBe(true);
  expect(rows.map((row) => row.id).sort()).toEqual(expectedIds);
  expect(new Set(rows.map((row) => row.id).values()).size).toBe(1001);
  expect(rows.map((row) => row.name)).toEqual(rows.map((row) => row.name).sort((a, b) => a.localeCompare(b)));
});
