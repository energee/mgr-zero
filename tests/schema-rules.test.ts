// tests/schema-rules.test.ts — schema-wide rules read straight from pg_catalog,
// so .agents/ARCHITECTURE.md conventions are gates, not prose. Uses `psql` (present on
// dev machines via libpq and on ubuntu-latest CI); DATABASE_URL overrides the
// local Supabase default. Lifted from MGR v1's check-* scripts, each of which
// was written after a Supabase advisor finding or a real bug.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

const DB = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";
const sql = (q: string) =>
  execFileSync("psql", [DB, "-Atc", q], { encoding: "utf8" }).trim().split("\n").filter(Boolean);

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

  it("pins the public schema and relation ACL matrix", () => {
    expect(sql(`
      with domain_relations as (
        select c.oid, c.relname, c.relkind
        from pg_class c
        where c.relnamespace = 'public'::regnamespace
          and c.relkind in ('r', 'v', 'S')
          and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
      ),
      role_privileges as (
        select role, relname, privilege
        from domain_relations
        cross join (values ('anon'::name), ('authenticated'::name), ('service_role'::name)) roles(role)
        cross join lateral (
          values
            ('SELECT', case when relkind in ('r', 'v') then has_table_privilege(role, oid, 'select') else has_sequence_privilege(role, oid, 'select') end),
            ('INSERT', case when relkind in ('r', 'v') then has_table_privilege(role, oid, 'insert') else false end),
            ('UPDATE', case when relkind in ('r', 'v') then has_table_privilege(role, oid, 'update') else has_sequence_privilege(role, oid, 'update') end),
            ('DELETE', case when relkind in ('r', 'v') then has_table_privilege(role, oid, 'delete') else false end),
            ('TRUNCATE', case when relkind in ('r', 'v') then has_table_privilege(role, oid, 'truncate') else false end),
            ('REFERENCES', case when relkind in ('r', 'v') then has_table_privilege(role, oid, 'references') else false end),
            ('TRIGGER', case when relkind in ('r', 'v') then has_table_privilege(role, oid, 'trigger') else false end),
            ('MAINTAIN', case when relkind in ('r', 'v') then has_table_privilege(role, oid, 'maintain') else false end),
            ('USAGE', case when relkind = 'S' then has_sequence_privilege(role, oid, 'usage') else false end)
        ) privileges(privilege, granted)
        where granted
      ),
      expected as (
        select 'authenticated'::name as role, relname, 'SELECT'::text as privilege
        from domain_relations where relkind in ('r', 'v')
        union all
        select 'authenticated'::name, relname, privilege
        from (values
          ('allocations', 'INSERT'), ('allocations', 'UPDATE'),
          ('breweries', 'UPDATE'),
          ('customers', 'INSERT'), ('customers', 'UPDATE'),
          ('inventory_movements', 'INSERT'),
          ('invoice_lines', 'INSERT'), ('invoices', 'INSERT'),
          ('locations', 'INSERT'),
          ('order_events', 'INSERT'),
          ('order_lines', 'DELETE'), ('order_lines', 'INSERT'), ('order_lines', 'UPDATE'),
          ('orders', 'INSERT'), ('orders', 'UPDATE'),
          ('price_list_items', 'INSERT'), ('price_list_items', 'UPDATE'),
          ('price_lists', 'INSERT'), ('price_lists', 'UPDATE'),
          ('products', 'INSERT'),
          ('ship_tos', 'INSERT'), ('ship_tos', 'UPDATE'),
          ('shipments', 'INSERT'),
          ('skus', 'INSERT'),
          ('taproom_pars', 'INSERT'), ('taproom_pars', 'UPDATE')
        ) as dml(relname, privilege)
        union all
        select 'service_role'::name, relname, privilege
        from domain_relations
        cross join lateral (
          values
            ('SELECT', relkind in ('r', 'v', 'S')),
            ('INSERT', relkind = 'r'),
            ('UPDATE', relkind in ('r', 'S')),
            ('DELETE', relkind = 'r'),
            ('USAGE', relkind = 'S')
        ) privileges(privilege, granted)
        where granted
      )
      select 'schema:' || role || ':' || privilege
      from (values
        ('anon'::name, 'usage', false), ('anon'::name, 'create', false),
        ('authenticated'::name, 'usage', true), ('authenticated'::name, 'create', false),
        ('service_role'::name, 'usage', true), ('service_role'::name, 'create', false)
      ) expected_schema(role, privilege, granted)
      where has_schema_privilege(role, 'public', privilege) <> granted
      union all
      select 'extra:' || role || ':' || relname || ':' || privilege
      from (select * from role_privileges except select * from expected) extra
      union all
      select 'missing:' || role || ':' || relname || ':' || privilege
      from (select * from expected except select * from role_privileges) missing
      order by 1
    `)).toEqual([]);
  });

  it("pins exact public function execute privileges by signature", () => {
    expect(sql(`
      with domain_functions as (
        select p.oid, p.oid::regprocedure::text as signature
        from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      ),
      actual as (
        select role, signature
        from domain_functions
        cross join (values ('anon'::name), ('authenticated'::name), ('service_role'::name)) roles(role)
        where has_function_privilege(role, oid, 'execute')
      ),
      expected as (
        select 'authenticated'::name as role, signature
        from (values
          ('my_brewery_ids()'),
          ('is_staff_of(uuid)'),
          ('staff_role(uuid)'),
          ('my_customer_ids()'),
          ('is_authorized_staff_rpc(uuid,text,staff_role[])'),
          ('require_authorized_staff_rpc(uuid,text,staff_role[])'),
          ('create_product(uuid,text,text,numeric)'),
          ('create_sku(uuid,uuid,text,package_type,integer,numeric)'),
          ('create_location(uuid,text,location_kind)'),
          ('upsert_customer(uuid,uuid,text,customer_type,text,uuid,text,text)'),
          ('upsert_ship_to(uuid,uuid,uuid,text,text,text,text,text,text)'),
          ('upsert_price_list(uuid,uuid,text)'),
          ('set_price(uuid,uuid,uuid,integer)'),
          ('record_movement(uuid,uuid,uuid,numeric,movement_type,sale_channel,text,text)'),
          ('set_taproom_par(uuid,uuid,uuid,numeric)'),
          ('order_line_price(uuid,uuid,uuid)'),
          ('set_portal_fulfillment_source(uuid,uuid)'),
          ('portal_create_order(uuid,text,text,jsonb)'),
          ('portal_update_draft_order(uuid,uuid,text,text,jsonb)'),
          ('portal_submit_order(uuid)'),
          ('create_order(uuid,order_kind,uuid,uuid,uuid,uuid,date,text,text,jsonb)'),
          ('lock_order(uuid,order_status[])'),
          ('update_draft_order(uuid,uuid,date,text,text,jsonb)'),
          ('submit_order(uuid)'),
          ('confirm_order(uuid)'),
          ('adjust_order_lines(uuid,jsonb,text)'),
          ('cancel_order(uuid,text)'),
          ('record_pick(uuid,jsonb)'),
          ('ship_order(uuid,jsonb,text,text)'),
          ('create_credit_memo(uuid,jsonb,uuid,text)'),
          ('set_standing_allocation(uuid,uuid,numeric)'),
          ('create_replenishment_order(uuid,uuid,jsonb)'),
          ('portal_availability(uuid)'),
          ('portal_brewery_rows()')
        ) callable(signature)
        union all
        select 'service_role'::name, signature from domain_functions
      )
      select 'extra:' || role || ':' || signature
      from (select * from actual except select * from expected) extra
      union all
      select 'missing:' || role || ':' || signature
      from (select * from expected except select * from actual) missing
      order by 1
    `)).toEqual([]);
  });

  it("staff RPC authorization fails closed when PostgREST's request.path GUC is absent", () => {
    // Every write policy hangs off is_authorized_staff_rpc; a connection that
    // is not a PostgREST request (no request.path) must be denied, not nulled through.
    expect(sql(`
      select coalesce(public.is_authorized_staff_rpc(gen_random_uuid(), 'create_product', array['admin']::public.staff_role[])::text, 'null')
    `)).toEqual(["null"]);
    expect(() => sql(`
      select public.require_authorized_staff_rpc(gen_random_uuid(), 'create_product', array['admin']::public.staff_role[])
    `)).toThrow(/permission denied for create_product/);
  });

  it("pins customer brewery exposure to portal_brewery columns, not the base table", () => {
    // Table-level SELECT on breweries is shared by staff and customers
    // (both are `authenticated`); the customer path is a view projection
    // plus no customer SELECT policy on the base table.
    expect(sql(`
      select attname from pg_attribute
      where attrelid = 'public.portal_brewery'::regclass
        and attnum > 0 and not attisdropped
      order by attnum
    `)).toEqual(["id", "name", "timezone", "portal_fulfillment_location_id"]);
    expect(sql(`
      select pg_get_function_result('public.portal_brewery_rows()'::regprocedure)
    `)).toEqual(["TABLE(id uuid, name text, timezone text, portal_fulfillment_location_id uuid)"]);
    expect(sql(`
      select polname from pg_policy
      where polrelid = 'public.breweries'::regclass
      order by 1
    `)).toEqual(["breweries_set_portal_fulfillment_source", "staff_read"]);
    expect(sql(`
      select col_description('public.breweries'::regclass, attnum)
      from pg_attribute
      where attrelid = 'public.breweries'::regclass and attname = 'settings'
    `)).toEqual(["staff-only; never store secrets here"]);
    expect(sql(`
      select coalesce(array_to_string(c.reloptions, ','), '')
      from pg_class c
      where c.oid = 'public.portal_brewery'::regclass
    `)).toEqual(["security_invoker=true"]);
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
        ('service_role'::name, 'usage'), ('service_role'::name, 'create')
      ) checks(role, privilege)
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
