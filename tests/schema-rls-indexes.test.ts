// tests/schema-rls-indexes.test.ts — RLS performance rules read straight from
// pg_catalog on the live local database (psql via tests/helpers.ts). Written
// after docs/audits/2026-09-05/security.md:
// (a) every table whose policy predicate filters on brewery_id must have an index
// whose first column is brewery_id, otherwise each RLS check is a sequential scan;
// (b) auth.uid() inside a policy must be wrapped as (select auth.uid()) so Postgres
// evaluates it once per statement (initPlan) instead of once per row.
// (c) the hot lookups #757 found as sequential scans each have an index leading
// with their columns, and no two indexes duplicate each other.
import { describe, it, expect } from "vitest";
import { sql } from "./helpers";

// Every public policy expression (qual and with_check) labelled by table.policy.
const POLICY_EXPRS = `
  select c.relname, p.polname,
         coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as expr
  from pg_policy p join pg_class c on c.oid = p.polrelid
  where c.relnamespace = 'public'::regnamespace`;

// Leading columns of every public index, comma-joined, labelled by table:
// "keg_events (brewery_id,at,created_at,id)". Expressions print as nothing.
const INDEX_PREFIXES = `
  select c.relname || ' (' || string_agg(a.attname, ',' order by k.ord) || ')'
  from pg_index i
  join pg_class c on c.oid = i.indrelid
  cross join lateral unnest(i.indkey) with ordinality k(attnum, ord)
  join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
  where c.relnamespace = 'public'::regnamespace
  group by i.indexrelid, c.relname`;

// Lookups an index must lead with (#757): membership by user for
// my_brewery_ids()/my_customer_ids() in every RLS check, keg history paged by
// time, delete_bin's "bin has stock" probes, and delete_customer's ship-to
// foreign-key check on orders.
const HOT_LOOKUPS = [
  "brewery_users (user_id)",
  "customer_users (user_id)",
  "keg_events (brewery_id,at,created_at,id)",
  "inventory_movements (bin_id)",
  "material_movements (bin_id)",
  "keg_events (bin_id)",
  "orders (ship_to_id)",
];

describe("RLS index and auth.uid() rules", () => {
  it("every hot lookup has an index leading with its columns", () => {
    const indexes = sql(INDEX_PREFIXES);
    // An index on (a,b,c) also serves a lookup on (a,b): match on the prefix.
    const leads = (have: string, want: string) => have === want || have.startsWith(want.slice(0, -1) + ",");
    const missing = HOT_LOOKUPS.filter((want) => !indexes.some((have) => leads(have, want)));
    expect(missing).toEqual([]);
  });

  it("no two indexes on a table share the same columns, predicate and expressions", () => {
    const duplicates = sql(`
      select a.indexrelid::regclass || ' = ' || b.indexrelid::regclass
      from pg_index a
      join pg_index b on b.indrelid = a.indrelid and a.indexrelid < b.indexrelid
        and a.indkey::text = b.indkey::text and a.indclass::text = b.indclass::text
        and coalesce(pg_get_expr(a.indpred, a.indrelid), '') = coalesce(pg_get_expr(b.indpred, b.indrelid), '')
        and coalesce(pg_get_expr(a.indexprs, a.indrelid), '') = coalesce(pg_get_expr(b.indexprs, b.indrelid), '')
      join pg_class c on c.oid = a.indrelid
      where c.relnamespace = 'public'::regnamespace
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
