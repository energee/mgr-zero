// tests/schema-rls-indexes.test.ts — RLS performance rules read straight from
// pg_catalog on the live local database (psql via tests/helpers.ts). Written
// after docs/audits/2026-09-05/security.md:
// (a) every table whose policy predicate filters on brewery_id must have an index
// whose first column is brewery_id, otherwise each RLS check is a sequential scan;
// (b) auth.uid() inside a policy must be wrapped as (select auth.uid()) so Postgres
// evaluates it once per statement (initPlan) instead of once per row;
// (c) #757: named hot lookups each have an index leading with their columns,
// and no two indexes have the same definition.
import { describe, it, expect } from "vitest";
import { sql } from "./helpers";

// Every public policy expression (qual and with_check) labelled by table.policy.
const POLICY_EXPRS = `
  select c.relname, p.polname,
         coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as expr
  from pg_policy p join pg_class c on c.oid = p.polrelid
  where c.relnamespace = 'public'::regnamespace`;

// Columns of every full (not partial) public index on plain columns, each followed by a comma and
// labelled by table: "keg_events:brewery_id,at,created_at,id,". A trailing
// comma makes a prefix test exact: "orders:ship_to_id," never matches ship_to_ids.
const INDEX_COLUMNS = `
  select c.relname || ':' || string_agg(a.attname || ',', '' order by k.ord)
  from pg_index i
  join pg_class c on c.oid = i.indrelid
  cross join lateral unnest(i.indkey) with ordinality k(attnum, ord)
  join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
  where c.relnamespace = 'public'::regnamespace and 0 <> all(i.indkey) and i.indpred is null
  group by i.indexrelid, c.relname`;

// Lookups #757 found as sequential scans; the migration
// 20261008150000_hot_lookup_indexes.sql names the caller of each.
const HOT_LOOKUPS = [
  "brewery_users:user_id,",
  "customer_users:user_id,",
  "keg_events:brewery_id,at,created_at,id,",
  "inventory_movements:bin_id,",
  "material_movements:bin_id,",
  "keg_events:bin_id,",
  "orders:ship_to_id,",
];

describe("RLS index and auth.uid() rules", () => {
  it("every hot lookup has an index leading with its columns", () => {
    const indexes = sql(INDEX_COLUMNS);
    const missing = HOT_LOOKUPS.filter((want) => !indexes.some((have) => have.startsWith(want)));
    expect(missing).toEqual([]);
  });

  it("no two indexes on a table have the same definition", () => {
    // A unique index serves the same reads as a plain one, so UNIQUE and the
    // name are stripped before comparing.
    const duplicates = sql(`
      select string_agg(i.indexrelid::regclass::text, ' = ' order by i.indexrelid::regclass::text)
      from pg_index i join pg_class c on c.oid = i.indrelid
      where c.relnamespace = 'public'::regnamespace
      group by regexp_replace(pg_get_indexdef(i.indexrelid), '^CREATE (UNIQUE )?INDEX \\S+ ', '')
      having count(*) > 1
      order by 1`);
    expect(duplicates).toEqual([]);
  });

  it("every table with a policy referencing brewery_id has an index whose first column is brewery_id", () => {
    const missing = sql(`
      with pol as (${POLICY_EXPRS}),
      indexed as (
        select c.relname
        from pg_index i
        join pg_class c on c.oid = i.indrelid
        join pg_attribute a on a.attrelid = c.oid and a.attnum = i.indkey[0]
        where c.relnamespace = 'public'::regnamespace and a.attname = 'brewery_id'
      )
      select distinct relname from pol
      where expr ~ '\\mbrewery_id\\M' and relname not in (select relname from indexed)
      order by 1`);
    expect(missing).toEqual([]);
  });

  it("no policy calls auth.uid() outside a (select auth.uid()) wrapper", () => {
    // pg_get_expr prints the wrapped form as "( SELECT auth.uid() AS uid)"; any other
    // occurrence of auth.uid() is a per-row call.
    const offenders = sql(`
      with pol as (${POLICY_EXPRS})
      select relname || '.' || polname from pol
      where regexp_replace(expr, '\\(\\s*SELECT auth\\.uid\\(\\)[^)]*\\)', '', 'gi') ~ 'auth\\.uid\\(\\)'
      order by 1`);
    expect(offenders).toEqual([]);
  });
});
