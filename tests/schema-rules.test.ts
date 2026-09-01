// tests/schema-rules.test.ts — schema-wide rules read straight from pg_catalog,
// so .agents/ARCHITECTURE.md conventions are gates, not prose. Uses `psql` (present on
// dev machines via libpq and on ubuntu-latest CI); DATABASE_URL overrides the
// local Supabase default. Lifted from MGR v1's check-* scripts, each of which
// was written after a Supabase advisor finding or a real bug.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

const DB = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";
function sql(q: string, quiet = false): string[] {
  const args = quiet ? [DB, "-Atq", "-c", q] : [DB, "-Atc", q];
  return execFileSync("psql", args, { encoding: "utf8" }).trim().split("\n").filter(Boolean);
}

describe("schema rules", () => {
  it("every public table has RLS enabled", () => {
    expect(sql(`select tablename from pg_tables where schemaname='public' and not rowsecurity order by 1`)).toEqual([]);
  });

  it("every permissive (true) policy carries an RLS-EXCEPTION comment", () => {
    // v1 00198: a policy that allows everything must say why, or CI fails.
    expect(sql(`
      select p.polname || ' on ' || c.relname
      from pg_policy p join pg_class c on c.oid = p.polrelid
      where c.relnamespace = 'public'::regnamespace
        and (pg_get_expr(p.polqual, p.polrelid) = 'true' or pg_get_expr(p.polwithcheck, p.polrelid) = 'true')
        and coalesce(obj_description(p.oid, 'pg_policy'), '') not like 'RLS-EXCEPTION:%'
      order by 1`)).toEqual([]);
  });

  it("every public view is security_invoker", () => {
    expect(sql(`
      select c.relname from pg_class c
      where c.relkind = 'v' and c.relnamespace = 'public'::regnamespace
        and not coalesce(array_to_string(c.reloptions, ',') like '%security_invoker=true%', false)
      order by 1`)).toEqual([]);
  });

  it("every public function pins search_path", () => {
    expect(sql(`
      select p.proname from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') -- skip extension-owned
        and not coalesce(array_to_string(p.proconfig, ',') like '%search_path=%', false)
      order by 1`)).toEqual([]);
  });

  it("security definer functions are not callable by anon", () => {
    // Definer functions bypass RLS; anon must never reach one.
    expect(sql(`
      select p.proname from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prosecdef
        and has_function_privilege('anon', p.oid, 'execute')
      order by 1`)).toEqual([]);
  });

  it("application roles cannot execute private functions", () => {
    expect(sql(`
      select p.proname
      from pg_proc p
      where p.pronamespace = 'private'::regnamespace
        and (
          has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute')
        )
      order by 1`)).toEqual([]);
  });

  it("future public and private objects default to no application-role privileges", () => {
    expect(sql(`
      begin;
      create table public.task3_default_acl_table (id int);
      create sequence public.task3_default_acl_sequence;
      create function public.task3_default_acl_function() returns int
        language sql set search_path = '' as $$ select 1 $$;
      create function private.task3_default_acl_function() returns int
        language sql set search_path = '' as $$ select 1 $$;
      select object_name
      from (
        values
          ('public table', has_table_privilege('anon', 'public.task3_default_acl_table', 'select')
            or has_table_privilege('authenticated', 'public.task3_default_acl_table', 'select')),
          ('public sequence', has_sequence_privilege('anon', 'public.task3_default_acl_sequence', 'usage')
            or has_sequence_privilege('authenticated', 'public.task3_default_acl_sequence', 'usage')),
          ('public function', has_function_privilege('anon', 'public.task3_default_acl_function()', 'execute')
            or has_function_privilege('authenticated', 'public.task3_default_acl_function()', 'execute')),
          ('private function', has_function_privilege('anon', 'private.task3_default_acl_function()', 'execute')
            or has_function_privilege('authenticated', 'private.task3_default_acl_function()', 'execute'))
      ) exposed(object_name, allowed)
      where allowed;
      rollback;
    `, true)).toEqual([]);
  });

  it("service_role retains the explicit membership writes used by invitations", () => {
    expect(sql(`
      select relname
      from (values ('brewery_users'), ('customer_users')) as required(relname)
      where not has_table_privilege('service_role', 'public.' || relname, 'insert')
      order by 1`)).toEqual([]);
  });
});
