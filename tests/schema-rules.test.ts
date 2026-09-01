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

  it("restricts brewery_counters keys to committed document kinds", () => {
    expect(sql(`
      select pg_get_constraintdef(oid) from pg_constraint
      where conrelid = 'public.brewery_counters'::regclass and contype = 'c'
    `)).toEqual(["CHECK ((key = ANY (ARRAY['batch'::text, 'run'::text, 'po'::text, 'order'::text, 'invoice'::text])))"]);
  });

  it("keeps integration token storage private and token columns out of public metadata", () => {
    expect(sql(`
      select 'column:' || c.relname || ':' || a.attname
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      where c.relnamespace = 'public'::regnamespace
        and c.relname in ('qbo_connections', 'pos_connections')
        and a.attnum > 0 and not a.attisdropped
        and a.attname in ('access_token', 'refresh_token')
      union all
      select 'schema:' || role || ':' || privilege
      from (values
        ('anon'::name, 'usage'::text), ('anon'::name, 'create'),
        ('authenticated'::name, 'usage'), ('authenticated'::name, 'create'),
        ('service_role'::name, 'create')
      ) checks(role, privilege)
      -- service_role holds USAGE on private only for the new_uuid() column default.
      where has_schema_privilege(role, 'private', privilege)
      union all
      select 'table:' || role || ':' || privilege
      from (values
        ('anon'::name), ('authenticated'::name), ('service_role'::name)
      ) roles(role)
      cross join (values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')) privileges(privilege)
      where has_table_privilege(role, 'private.integration_tokens', privilege)
      union all
      select 'private:integration_tokens:rls'
      where not (select relrowsecurity from pg_class where oid = 'private.integration_tokens'::regclass)
      order by 1
    `)).toEqual([]);
  });

  it("pins service-only integration token RPC execute privileges by signature", () => {
    expect(sql(`
      with token_functions as (
        select p.oid, p.oid::regprocedure::text as signature
        from pg_proc p
        where p.oid::regprocedure::text in (
          'store_integration_tokens(uuid,text,uuid,uuid,text,text)',
          'read_integration_tokens(uuid,text,uuid,uuid)'
        )
      ),
      actual as (
        select role, signature
        from token_functions
        cross join (values ('anon'::name), ('authenticated'::name), ('service_role'::name)) roles(role)
        where has_function_privilege(role, oid, 'execute')
      ),
      expected(role, signature) as (
        values
          ('service_role'::name, 'store_integration_tokens(uuid,text,uuid,uuid,text,text)'::text),
          ('service_role'::name, 'read_integration_tokens(uuid,text,uuid,uuid)'::text)
      )
      select 'extra:' || role || ':' || signature
      from (select * from actual except select * from expected) extra
      union all
      select 'missing:' || role || ':' || signature
      from (select * from expected except select * from actual) missing
      order by 1
    `)).toEqual([]);
  });

  // `supabase_admin` is a reserved bootstrap role; its exposure is controlled
  // by config, while migrations can safely audit only their own future defaults.
  it("revokes Data API roles from future public objects created by the migration role", () => {
    expect(sql(`
      with creators as (
        select oid, rolname from pg_roles where oid = current_user::regrole
      ),
      object_types(defaclobjtype) as (
        values ('r'::"char"), ('S'::"char"), ('f'::"char")
      ),
      schema_defaults as (
        select creators.oid, creators.rolname, object_types.defaclobjtype, d.defaclacl
        from creators
        cross join object_types
        left join pg_default_acl d on d.defaclrole = creators.oid
          and d.defaclnamespace = 'public'::regnamespace
          and d.defaclobjtype = object_types.defaclobjtype
      ),
      forbidden as (
        select 'schema:' || schema_defaults.rolname || ':' || defaclobjtype::text || ':' ||
          coalesce(grantee.rolname, 'PUBLIC') || ':' || permissions.privilege_type
        from schema_defaults
        cross join lateral aclexplode(coalesce(defaclacl, acldefault(defaclobjtype, oid))) permissions
        left join pg_roles grantee on grantee.oid = permissions.grantee
        where permissions.grantee = 0 or grantee.rolname in ('anon', 'authenticated', 'service_role')
        union all
        select 'global:' || owner.rolname || ':' || d.defaclobjtype::text || ':' ||
          coalesce(grantee.rolname, 'PUBLIC') || ':' || permissions.privilege_type
        from pg_default_acl d
        join creators owner on owner.oid = d.defaclrole
        cross join lateral aclexplode(d.defaclacl) permissions
        left join pg_roles grantee on grantee.oid = permissions.grantee
        where d.defaclnamespace = 0
          and (permissions.grantee = 0 or grantee.rolname in ('anon', 'authenticated', 'service_role'))
      )
      select * from forbidden order by 1
    `)).toEqual([]);
  });
});
