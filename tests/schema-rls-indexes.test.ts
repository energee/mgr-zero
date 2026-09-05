// tests/schema-rls-indexes.test.ts — RLS performance rules read straight from
// pg_catalog on the live local database (same psql approach as
// tests/schema-rules.test.ts). Written after docs/audits/2026-09-05/security.md:
// (a) every table whose policy predicate filters on brewery_id must have an index
// whose first column is brewery_id, otherwise each RLS check is a sequential scan;
// (b) auth.uid() inside a policy must be wrapped as (select auth.uid()) so Postgres
// evaluates it once per statement (initPlan) instead of once per row.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

const DB = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";
function sql(q: string): string[] {
  return execFileSync("psql", [DB, "-Atc", q], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
}

// Every public policy expression (qual and with_check) labelled by table.policy.
const POLICY_EXPRS = `
  select c.relname, p.polname,
         coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as expr
  from pg_policy p join pg_class c on c.oid = p.polrelid
  where c.relnamespace = 'public'::regnamespace`;

describe("RLS index and auth.uid() rules", () => {
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
