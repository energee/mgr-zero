import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import type { StaffRole } from "@/lib/commands/registry";
import { DB, ins, makeCustomerUser, sql } from "./helpers";
import { fixtures, keys, matrix, type Fixture, type Row, type Table } from "./rls-fixtures";

// Independent approval matrix, not derived from policy SQL or helper results.
// Each entry below produces a real SELECT against nonempty own AND foreign fixtures.
const groups = {
  staff: ["allocations", "batch_additions", "batches", "brew_pulls", "brew_records", "breweries", "catalog_categories", "fermentation_readings", "format_bom", "inventory_movements", "keg_events", "material_contracts", "material_count_lines", "material_counts", "material_lots", "material_movements", "materials", "packaging_material_actuals", "packaging_material_records", "packaging_output_corrections", "packaging_run_consumptions", "packaging_run_outputs", "packaging_runs", "price_groups", "purchase_order_lines", "purchase_orders", "receipt_lines", "receipts", "recipe_ingredients", "recipe_versions", "recipe_water_additions", "recipes", "styles", "transfers", "vendors", "vessel_occupancies", "vessels", "volume_adjustment_reclassifications", "volume_adjustments", "water_profiles"],
  all: ["brands", "format_components", "formats", "keg_pools", "skus", "tap_intervals", "taproom_count_lines", "taproom_counts"],
  salesWarehouse: ["customers", "deliveries", "invoice_lines", "invoice_payment_voids", "invoice_payments", "invoices", "lots", "order_deposit_lines", "order_events", "order_lines", "orders", "routes", "sale_channels", "ship_tos", "shipments", "stock_transfer_lines", "stock_transfers"],
  // Every role reads COLA approvals; formula approvals stay Admin and Sales (#965).
  cola: ["brand_approvals"],
  sales: ["brewery_state_licenses", "channel_prices", "invoice_questions", "price_group_barcodes", "qbo_customer_decisions", "qbo_customer_snapshots", "report_basis_amendments", "report_filings", "reporting_basis_corrections", "state_registrations"],
  warehouse: ["pos_catalog_items", "pos_catalog_ownership", "pos_catalog_variations", "pos_menu_lines", "pos_menus", "pos_sales", "pos_sale_expectations", "pos_sales_coverage"],
  warehouseTaproom: ["pos_item_mappings", "pos_locations"],
  integrations: ["pos_connections", "qbo_connections", "qbo_pushes"],
  taproomLocation: ["bins", "locations", "taproom_pars"],
} as const satisfies Record<string, readonly Table[]>;
type Group = keyof typeof groups | "members" | "admin" | "self" | "personal" | "shared";
interface PolicyCase { table: Table; policy: string; group: Group }
const policies: PolicyCase[] = [
  ...Object.entries(groups).flatMap(([group, tables]) => tables.map(table => ({
    table, group: group as Group, policy: group === "integrations" ? "integration_operator_read" : "staff_read",
  }))),
  { table: "brewery_users", policy: "member_read", group: "members" },
  { table: "chat_installations", policy: "chat_installations_admin_read", group: "admin" },
  { table: "pos_location_mapping_history", policy: "pos_location_mapping_history_staff", group: "admin" },
  { table: "chat_user_links", policy: "chat_user_links_self_read", group: "self" },
  { table: "notification_preferences", policy: "notification_preferences_self_read", group: "self" },
  { table: "notification_destinations", policy: "notification_destinations_personal_read", group: "personal" },
  { table: "notification_destinations", policy: "notification_destinations_admin_shared_read", group: "shared" },
];
const singles: StaffRole[] = ["admin", "sales", "warehouse", "brewer", "taproom"];
const pairs: StaffRole[][] = [["sales", "brewer"], ["warehouse", "brewer"], ["taproom", "brewer"], ["admin", "sales"]];

function allowed(test: PolicyCase, rows: Row[], role: StaffRole, own: Fixture) {
  const staff = role !== "taproom";
  switch (test.group) {
    case "staff": return staff ? rows : [];
    case "all": return rows;
    case "salesWarehouse": return ["admin", "sales", "warehouse"].includes(role) ? rows : [];
    case "cola": return ["admin", "sales"].includes(role) ? rows : rows.filter(row => row.kind === "cola");
    case "sales": case "integrations": return ["admin", "sales"].includes(role) ? rows : [];
    case "warehouse": return ["admin", "warehouse"].includes(role) ? rows : [];
    case "warehouseTaproom": return ["admin", "warehouse", "taproom"].includes(role) ? rows : [];
    case "taproomLocation": return staff ? rows : rows.filter(row => own.taps.some(location => location.id === (test.table === "locations" ? row.id : row.location_id)));
    case "members": return staff ? rows : rows.filter(row => row.user_id === own.taproom.id);
    case "admin": case "shared": return role === "admin" ? rows : [];
    case "self": return rows.filter(row => row.user_id === own.taproom.id && (test.table !== "chat_user_links" || row.state === "active"));
    case "personal": return rows.filter(row => row.user_id === own.taproom.id);
  }
}

async function personalRows(f: Fixture, userId: string) {
  await ins("chat_user_links", { brewery_id: f.brewery.id, installation_id: f.installation.id, provider: "slack", external_user_id: userId, user_id: userId, state: "active" });
  const destination = await ins("notification_destinations", { brewery_id: f.brewery.id, installation_id: f.installation.id, kind: "personal", external_destination_id: userId, user_id: userId, privacy_class: "direct" });
  await ins("notification_preferences", { brewery_id: f.brewery.id, user_id: userId, reason: "operations_digest", personal_destination_id: destination.id });
}

// Only fixed table identifiers from the explicit matrix enter SQL interpolation.
function scope(test: PolicyCase) {
  return test.group === "personal" ? " and t.kind='personal'" : test.group === "shared" ? " and t.kind='private_channel'" : "";
}

describe("all staff-dependent RLS policies preserve multi-role union (#797)", { concurrent: false }, () => {
  let own: Fixture, foreign: Fixture, buyerId: string, connection: Client;
  const positive = new Map<string, Row[]>();

  beforeAll(async () => {
    own = await fixtures();
    foreign = await fixtures();
    const buyer = await makeCustomerUser(own.customer.customerId);
    buyerId = buyer.id;
    // Own-user rows are deliberately present without staff membership. This makes
    // membership and tenant denials meaningful even for self-read predicates.
    await personalRows(own, buyerId);
    await personalRows(foreign, own.taproom.id);
    await ins("chat_user_links", { brewery_id: own.brewery.id, installation_id: own.installation.id, provider: "slack", external_user_id: "disabled-own", user_id: own.taproom.id, state: "disabled" });
    connection = new Client({ connectionString: DB });
    await connection.connect();
    await connection.query("begin");
    // These existing policies sit behind a stricter service-only ACL. Grant only
    // inside this rolled-back owner transaction so SELECT actually exercises RLS,
    // rather than claiming a pre-policy ACL error proves policy correctness.
    await connection.query("grant select on public.qbo_customer_snapshots, public.qbo_customer_decisions, public.volume_adjustment_reclassifications to authenticated");
    await connection.query("update public.breweries set portal_fulfillment_location_id=$1 where id=$2", [own.wh.id, own.brewery.id]);
    for (const test of policies) {
      const column = test.table === "breweries" ? "id" : "brewery_id";
      const result = await connection.query(`select t.* from public.${test.table} t where t.${column}=$1${scope(test)}`, [own.brewery.id]);
      const other = await connection.query(`select t.* from public.${test.table} t where t.${column}=$1${scope(test)}`, [foreign.brewery.id]);
      expect(result.rows.length, `${test.table}:${test.policy} nonempty own fixture`).toBeGreaterThan(0);
      expect(other.rows.length, `${test.table}:${test.policy} nonempty foreign fixture`).toBeGreaterThan(0);
      positive.set(`${test.table}:${test.policy}`, result.rows);
    }
  }, 120_000);

  afterAll(async () => {
    if (connection) {
      try { await connection.query("rollback"); } finally { await connection.end(); }
    }
  });

  async function read(test: PolicyCase, userId: string, roles: StaffRole[] | null, includeForeign = true) {
    if (roles) await connection.query("update public.brewery_users set roles=$1::public.staff_role[] where brewery_id=$2 and user_id=$3", [roles, own.brewery.id, own.taproom.id]);
    await connection.query("select set_config('request.jwt.claim.sub',$1,true)", [userId]);
    await connection.query("set local role authenticated");
    try {
      // chat_installations intentionally exposes only health columns. All other
      // projections retain location/state/owner fields for exact row-set checks.
      const columns = test.table === "chat_installations" ? "t.id,t.brewery_id,t.state" : "t.*";
      const column = test.table === "breweries" ? "id" : "brewery_id";
      return (await connection.query(`select ${columns} from public.${test.table} t where t.${column}=any($1::uuid[])${scope(test)}`, [includeForeign ? [own.brewery.id, foreign.brewery.id] : [own.brewery.id]])).rows as Row[];
    } finally { await connection.query("reset role"); }
  }

  it("classifies every live staff policy and all four separate portal policies", () => {
    const actual = sql(`select tablename||':'||policyname from pg_policies where schemaname='public'
      and coalesce(qual,'')||coalesce(with_check,'') ~ '(staff_roles?\\(|has_staff_role|is_staff_of|my_staff_brewery_ids|taproom_can)' order by 1`);
    expect(new Set(policies.map(test => `${test.table}:${test.policy}`)).size).toBe(policies.length);
    expect(actual).toEqual(policies.map(test => `${test.table}:${test.policy}`).sort());
    expect(sql(`select tablename||':'||policyname from pg_policies where schemaname='public'
      and not (coalesce(qual,'')||coalesce(with_check,'') ~ '(staff_roles?\\(|has_staff_role|is_staff_of|my_staff_brewery_ids|taproom_can)') order by 1`))
      .toEqual(["customer_users:self_read", "invoice_questions:customer_read", "locations:customer_read_portal_source", "ship_tos:customer_own"]);
    expect(policies.every(test => test.table in matrix)).toBe(true);
  });

  for (const test of policies) {
    it(`${test.table}:${test.policy}: exact single-role and union row sets, cross-tenant and portal denial`, async () => {
      const rows = positive.get(`${test.table}:${test.policy}`)!;
      const observed = new Map<StaffRole, string[]>();
      for (const role of singles) {
        const expected = allowed(test, rows, role, own);
        // A positive control for every rewritten predicate, including admin-only
        // policies the three required non-admin pairs correctly cannot reach.
        if (role === "admin") expect(expected.length, "admin allowed fixture").toBeGreaterThan(0);
        const seen = keys(test.table, await read(test, own.taproom.id, [role]));
        expect(seen, `${role} exact own scope and no foreign rows`).toEqual(keys(test.table, expected));
        observed.set(role, seen);
      }
      for (const roles of pairs) {
        const union = [...new Set(roles.flatMap(role => observed.get(role)!))].sort();
        expect(keys(test.table, await read(test, own.taproom.id, roles)), roles.join("+")).toEqual(union);
      }
      // A buyer has own-user chat rows but no brewery staff membership. Existing
      // customer-only policies on these three base tables remain independent.
      const portalRows = test.table === "ship_tos" || test.table === "invoice_questions"
        ? rows.filter(row => row.customer_id === own.customer.customerId)
        : test.table === "locations" ? rows.filter(row => row.id === own.wh.id) : [];
      expect(keys(test.table, await read(test, buyerId, null, false)), "portal is not staff").toEqual(keys(test.table, portalRows));
      expect(await read(test, foreign.taproom.id, null, false), "authenticated nonmember denied").toEqual([]);
    });
  }

  it("an admin role in an array still cannot read another user's private chat rows", async () => {
    for (const test of policies.filter(test => test.group === "self" || test.group === "personal")) {
      const rows = positive.get(`${test.table}:${test.policy}`)!;
      expect(rows.some(row => row.user_id === own.owner.id), "other owner's private negative fixture").toBe(true);
      const result = await read(test, own.taproom.id, ["admin", "sales"]);
      expect(keys(test.table, result)).toEqual(keys(test.table, allowed(test, rows, "admin", own)));
      expect(result.every(row => row.user_id === own.taproom.id)).toBe(true);
    }
  });

  it("staff_roles returns the stored array and has_staff_role is plain overlap, never null", async () => {
    await connection.query("update public.brewery_users set roles=array['sales','brewer']::public.staff_role[] where brewery_id=$1 and user_id=$2", [own.brewery.id, own.taproom.id]);
    await connection.query("select set_config('request.jwt.claim.sub',$1,true)", [own.taproom.id]);
    await connection.query("set local role authenticated");
    try {
      expect((await connection.query(`select public.staff_roles($1)::text[] roles,
        public.has_staff_role($1,array['warehouse','brewer']::public.staff_role[]) overlap,
        public.has_staff_role($1,array['admin','taproom']::public.staff_role[]) disjoint,
        public.has_staff_role($1,array[]::public.staff_role[]) empty`, [own.brewery.id])).rows)
        .toEqual([{ roles: ["sales", "brewer"], overlap: true, disjoint: false, empty: false }]);
    } finally { await connection.query("reset role"); }
    await connection.query("update public.brewery_users set roles=array['admin','sales']::public.staff_role[] where brewery_id=$1 and user_id=$2", [own.brewery.id, own.taproom.id]);
    await connection.query("set local role authenticated");
    try {
      expect((await connection.query("select public.has_staff_role($1,array['brewer']::public.staff_role[]) held", [own.brewery.id])).rows)
        .toEqual([{ held: false }]);
    } finally { await connection.query("reset role"); }
    await connection.query("select set_config('request.jwt.claim.sub',$1,true)", [buyerId]);
    await connection.query("set local role authenticated");
    try {
      expect((await connection.query("select public.staff_roles($1)::text[] roles, public.has_staff_role($1,enum_range(null::public.staff_role)) held", [own.brewery.id])).rows)
        .toEqual([{ roles: null, held: false }]);
    } finally { await connection.query("reset role"); }
  });

  it("trusted-actor role checks use union membership, deny missing scope, and are not directly executable", async () => {
    await connection.query("update public.brewery_users set roles=array['sales','brewer']::public.staff_role[] where brewery_id=$1 and user_id=$2", [own.brewery.id, own.taproom.id]);
    expect((await connection.query(`select
      private.actor_has_staff_roles($1,$2,array['sales']::public.staff_role[]) sales,
      private.actor_has_staff_roles($1,$2,array['warehouse','brewer']::public.staff_role[]) brewer,
      private.actor_has_staff_roles($1,$2,array['admin','warehouse']::public.staff_role[]) denied,
      private.actor_has_staff_roles($3,$2,array['sales']::public.staff_role[]) foreign_tenant,
      private.actor_has_staff_roles($1,$4,array['sales']::public.staff_role[]) nonmember,
      private.actor_has_staff_roles($1,null,array['sales']::public.staff_role[]) missing_actor,
      private.actor_has_staff_roles($1,$2,array[]::public.staff_role[]) empty_roles,
      private.actor_has_staff_roles($1,$2,null::public.staff_role[]) missing_roles`,
    [own.brewery.id, own.taproom.id, foreign.brewery.id, buyerId])).rows)
      .toEqual([{ sales: true, brewer: true, denied: false, foreign_tenant: false, nonmember: false, missing_actor: false, empty_roles: false, missing_roles: false }]);
    expect(sql(`select r.name||':'||has_function_privilege(r.name,
      'private.actor_has_staff_roles(uuid,uuid,public.staff_role[])','execute')
      from (values('anon'),('authenticated'),('service_role')) r(name) order by r.name`))
      .toEqual(["anon:false", "authenticated:false", "service_role:false"]);
    expect(sql(`select prosecdef||':'||(provolatile='s') from pg_proc
      where oid='private.actor_has_staff_roles(uuid,uuid,public.staff_role[])'::regprocedure`))
      .toEqual(["false:true"]);
    for (const role of ["anon", "authenticated", "service_role"]) {
      await connection.query("savepoint direct_actor_helper");
      try {
        await connection.query(`set local role ${role}`);
        await expect(connection.query("select private.actor_has_staff_roles($1,$2,array['sales']::public.staff_role[])", [own.brewery.id, own.taproom.id]))
          .rejects.toMatchObject({ code: "42501" });
      } finally {
        await connection.query("rollback to savepoint direct_actor_helper");
        await connection.query("release savepoint direct_actor_helper");
      }
    }
  });

  it("rejects empty, multidimensional and null-containing membership arrays at the table boundary", async () => {
    for (const [expression, code] of [
      ["array[]::public.staff_role[]", "23514"],
      ["array[array['sales','brewer'],array['sales','brewer']]::public.staff_role[]", "23514"],
      ["array['sales',null]::public.staff_role[]", "23514"],
      ["null::public.staff_role[]", "23502"],
    ]) {
      await connection.query("savepoint invalid_roles");
      try {
        await expect(connection.query(`update public.brewery_users set roles=${expression} where brewery_id=$1 and user_id=$2`, [own.brewery.id, own.taproom.id]))
          .rejects.toMatchObject({ code });
      } finally {
        await connection.query("rollback to savepoint invalid_roles");
        await connection.query("release savepoint invalid_roles");
      }
    }
  });

  it("update_staff_role canonicalizes duplicates in enum order in both its result and stored membership", async () => {
    await connection.query("select set_config('request.jwt.claim.sub',$1,true)", [own.owner.id]);
    await connection.query("set local role authenticated");
    try {
      const updated = await connection.query("select public.update_staff_role($1,$2,$3::public.staff_role[],$4) result", [own.brewery.id, own.taproom.id, ["brewer", "sales", "brewer"], crypto.randomUUID()]);
      expect(updated.rows[0].result).toMatchObject({ brewery_id: own.brewery.id, user_id: own.taproom.id, roles: ["sales", "brewer"] });
    } finally { await connection.query("reset role"); }
    expect((await connection.query("select roles::text[] roles from public.brewery_users where brewery_id=$1 and user_id=$2", [own.brewery.id, own.taproom.id])).rows)
      .toEqual([{ roles: ["sales", "brewer"] }]);
  });

  it("customer request scope cannot turn a dual admin+sales/buyer membership into staff reads", async () => {
    await connection.query("update public.brewery_users set roles=array['admin','sales']::public.staff_role[] where brewery_id=$1 and user_id=$2", [own.brewery.id, own.owner.id]);
    await connection.query("select set_config('request.headers',$1,true)", [JSON.stringify({
      "x-mgr-actor-id": own.owner.id,
      "x-mgr-brewery-id": own.brewery.id,
      "x-mgr-customer-id": own.customer.customerId,
    })]);
    try {
      await connection.query("select set_config('request.jwt.claim.sub',$1,true)", [own.owner.id]);
      await connection.query("set local role authenticated");
      try {
        expect((await connection.query("select public.staff_roles($1)::text[] roles, public.has_staff_role($1,enum_range(null::public.staff_role)) held, public.is_staff_of($1) staff", [own.brewery.id])).rows)
          .toEqual([{ roles: null, held: false, staff: false }]);
      } finally { await connection.query("reset role"); }
      for (const test of policies) {
        const rows = positive.get(`${test.table}:${test.policy}`)!;
        const portalRows = test.table === "ship_tos" || test.table === "invoice_questions"
          ? rows.filter(row => row.customer_id === own.customer.customerId)
          : test.table === "locations" ? rows.filter(row => row.id === own.wh.id) : [];
        expect(keys(test.table, await read(test, own.owner.id, null)), `${test.table}:${test.policy} customer-scoped dual member`)
          .toEqual(keys(test.table, portalRows));
      }
    } finally { await connection.query("select set_config('request.headers','',true)"); }
  });

  it("customer scope cannot call staff chat reads, OAuth starts or link consent for a dual member", async () => {
    const proof = crypto.randomUUID();
    await connection.query(`insert into public.chat_user_links
      (brewery_id,installation_id,provider,external_user_id,state,proof_hash,proof_expires_at)
      values($1,$2,'slack',$3,'pending',$4,now()+interval '1 hour')`,
    [own.brewery.id, own.installation.id, `scope-${proof}`, proof]);
    await connection.query("select set_config('request.jwt.claim.sub',$1,true)", [own.owner.id]);
    await connection.query("select set_config('request.headers',$1,true)", [JSON.stringify({
      "x-mgr-actor-id": own.owner.id,
      "x-mgr-brewery-id": own.brewery.id,
      "x-mgr-customer-id": own.customer.customerId,
    })]);
    try {
      const calls = [
        { query: "select public.list_chat_user_links($1)", values: [own.brewery.id] },
        { query: "select public.get_chat_integration_health($1)", values: [own.brewery.id] },
        { query: "select public.begin_qbo_oauth($1,$2,$3,$4,$5)", values: [own.brewery.id, "https://mgr.test/callback", "a".repeat(64), "connect", crypto.randomUUID()] },
        { query: "select public.consume_chat_link_proof($1,$2,$3)", values: [own.brewery.id, proof, crypto.randomUUID()] },
      ];
      for (const call of calls) {
        await connection.query("savepoint portal_staff_rpc");
        try {
          await connection.query("set local role authenticated");
          await expect(connection.query(call.query, call.values)).rejects.toMatchObject({ code: "42501" });
        } finally {
          await connection.query("rollback to savepoint portal_staff_rpc");
          await connection.query("release savepoint portal_staff_rpc");
        }
      }
    } finally { await connection.query("select set_config('request.headers','',true)"); }
  });

  it("the separate customer-users policy remains own-customer-only, not staff membership", async () => {
    const baseline = await connection.query("select customer_id,user_id from public.customer_users where customer_id=any($1::uuid[])", [[own.customer.customerId, foreign.customer.customerId]]);
    expect(baseline.rows.length).toBeGreaterThan(2);
    expect(baseline.rows.some(row => row.user_id === own.owner.id)).toBe(true);
    await connection.query("select set_config('request.jwt.claim.sub',$1,true)", [buyerId]);
    await connection.query("set local role authenticated");
    try {
      const seen = await connection.query("select customer_id,user_id from public.customer_users where customer_id=any($1::uuid[])", [[own.customer.customerId, foreign.customer.customerId]]);
      expect(seen.rows).toEqual([{ customer_id: own.customer.customerId, user_id: buyerId }]);
    } finally { await connection.query("reset role"); }
    await connection.query("select set_config('request.jwt.claim.sub',$1,true)", [own.taproom.id]);
    await connection.query("set local role authenticated");
    try {
      expect((await connection.query("select customer_id,user_id from public.customer_users where customer_id=any($1::uuid[])", [[own.customer.customerId, foreign.customer.customerId]])).rows).toEqual([]);
    } finally { await connection.query("reset role"); }
  });

  it("personal destinations require an active own-user link even with admin+sales", async () => {
    const test = policies.find(test => test.group === "personal")!;
    expect((await read(test, own.taproom.id, ["admin", "sales"])).length).toBeGreaterThan(0);
    await connection.query("savepoint inactive_link");
    try {
      await connection.query("update public.chat_user_links set state='disabled' where brewery_id=$1 and user_id=$2 and state='active'", [own.brewery.id, own.taproom.id]);
      expect(await read(test, own.taproom.id, ["admin", "sales"])).toEqual([]);
      const links = policies.find(test => test.table === "chat_user_links")!;
      expect(await read(links, own.taproom.id, ["admin", "sales"])).toEqual([]);
      // Preferences retain their different contract: own membership, not a link.
      const preferences = policies.find(test => test.table === "notification_preferences")!;
      expect((await read(preferences, own.taproom.id, ["admin", "sales"])).length).toBeGreaterThan(0);
    } finally { await connection.query("rollback to savepoint inactive_link"); }
  });
});
