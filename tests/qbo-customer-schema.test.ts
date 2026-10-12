// tests/qbo-customer-schema.test.ts — QuickBooks customer data foundation:
// the nine customer columns, one-QBO-customer-per-realm uniqueness, and the
// admin/sales-only snapshot and decision tables. Whether buyers can read the new
// customer columns is #793's concern and is not asserted here.
import { describe, it, expect } from "vitest";
import { admin, insertFixture, makeBrewery, makeStaffCtx, makeCustomerUser, asUser, seedCustomer, sql } from "./helpers";

// No application role, service role included, may write these tables, so seed through the privileged fixture helper.
const seedSnapshot = (breweryId: string, id: string, realm = "r1") => insertFixture("qbo_customer_snapshots", {
  brewery_id: breweryId, realm_id: realm, qbo_customer_id: id, display_name: `Cust ${id}`, active: true,
  sync_token: "0", qbo_updated_at: "2026-10-01", read_at: "2026-10-02",
});
// insertFixture throws "fixture insert failed with SQLSTATE <state>" on a failed insert.
const decide = (breweryId: string, userId: string, snapshotId: string, decision: string, customerId: string | null) => insertFixture("qbo_customer_decisions", {
  brewery_id: breweryId, realm_id: "r1", qbo_customer_id: snapshotId, customer_id: customerId, decision, decided_by: userId,
});

// A fresh brewery with a customer, an admin, a sales user, a warehouse user and a buyer.
async function fresh() {
  const breweryId = (await makeBrewery()).id;
  const { customerId } = await seedCustomer(breweryId);
  const a = await makeStaffCtx(breweryId, "admin");
  return {
    breweryId, customerId, adminUserId: a.userId,
    dbs: {
      admin: a.db,
      sales: (await makeStaffCtx(breweryId, "sales")).db,
      warehouse: (await makeStaffCtx(breweryId, "warehouse")).db,
      buyer: await asUser((await makeCustomerUser(customerId)).email),
    },
  };
}

describe("customer columns", () => {
  it("adds exactly these nullable text columns and installs the extensions", () => {
    expect(sql(`select column_name||':'||data_type||':'||is_nullable from information_schema.columns
      where table_schema='public' and table_name='customers'
      and column_name in ('billing_email','phone','bill_address1','bill_address2','bill_city','bill_state','bill_zip','qbo_sync_token','qbo_sync_state')
      order by column_name`)).toEqual([
      "bill_address1:text:YES", "bill_address2:text:YES", "bill_city:text:YES", "bill_state:text:YES", "bill_zip:text:YES",
      "billing_email:text:YES", "phone:text:YES", "qbo_sync_state:text:YES", "qbo_sync_token:text:YES",
    ]);
    expect(sql(`select extname from pg_extension where extname in ('pg_trgm','unaccent') order by 1`)).toEqual(["pg_trgm", "unaccent"]);
  });

  it("rejects an unknown sync state with a check violation", async () => {
    const { customerId } = await fresh();
    const { error } = await admin.from("customers").update({ qbo_sync_state: "bogus" }).eq("id", customerId);
    expect(error?.code).toBe("23514");
    const ok = await admin.from("customers").update({ qbo_sync_state: "pending" }).eq("id", customerId);
    expect(ok.error).toBeNull();
  });

  it("links one QuickBooks customer to at most one MGR customer per brewery and realm", async () => {
    const { breweryId, customerId } = await fresh();
    const second = (await seedCustomer(breweryId, { name: "Second" })).customerId;
    const link = (id: string, realm: string | null) =>
      admin.from("customers").update({ qbo_customer_id: "q1", qbo_realm_id: realm }).eq("id", id);
    expect((await link(customerId, "r1")).error).toBeNull();
    expect((await link(second, "r1")).error?.code).toBe("23505");
    expect((await link(second, "r2")).error).toBeNull();
    // Same QBO id and realm in a different brewery is a different mapping.
    const other = await fresh();
    expect((await link(other.customerId, "r1")).error).toBeNull();
  });

  it("leaves legacy rows with a null realm outside the scoped uniqueness", async () => {
    const { breweryId, customerId } = await fresh();
    const second = (await seedCustomer(breweryId, { name: "Second" })).customerId;
    for (const id of [customerId, second]) {
      const { error } = await admin.from("customers").update({ qbo_customer_id: "legacy", qbo_realm_id: null }).eq("id", id);
      expect(error).toBeNull();
    }
  });
});

describe("snapshots and decisions are admin/sales only", () => {
  it("lets admin and sales read their own brewery's snapshots and nothing else", async () => {
    const t = await fresh();
    const o = await fresh();
    seedSnapshot(t.breweryId, "a");
    seedSnapshot(t.breweryId, "b");
    seedSnapshot(o.breweryId, "same");
    seedSnapshot(t.breweryId, "same"); // same QBO id in two breweries is allowed
    for (const who of ["admin", "sales"] as const) {
      const { data, error } = await t.dbs[who].from("qbo_customer_snapshots").select("brewery_id,qbo_customer_id");
      expect(error, who).toBeNull();
      expect(data!.every((r) => r.brewery_id === t.breweryId), who).toBe(true);
      expect(data!.map((r) => r.qbo_customer_id).sort(), who).toEqual(["a", "b", "same"]);
    }
    const own = await o.dbs.admin.from("qbo_customer_snapshots").select("brewery_id,qbo_customer_id");
    expect(own.data).toEqual([{ brewery_id: o.breweryId, qbo_customer_id: "same" }]);
    for (const who of ["warehouse", "buyer"] as const) {
      const { data } = await t.dbs[who].from("qbo_customer_snapshots").select("qbo_customer_id");
      expect(data, who).toEqual([]);
    }
  });

  it("grants select to authenticated only and no write to any application role", async () => {
    const t = await fresh();
    const grants = sql(`select t||':'||r||':'||p||':'||has_table_privilege(r,'public.'||t,p)::text
      from unnest(array['qbo_customer_snapshots','qbo_customer_decisions']) t,
           unnest(array['anon','authenticated','service_role']) r,
           unnest(array['select','insert','update','delete','truncate']) p order by 1`);
    expect(grants).toHaveLength(30);
    for (const g of grants) {
      const [table, role, priv, has] = g.split(":");
      expect(has, `${role} ${priv} ${table}`).toBe(role === "authenticated" && priv === "select" ? "true" : "false");
    }
    const row = { brewery_id: t.breweryId, realm_id: "r1", qbo_customer_id: "z", display_name: "Z", active: true, sync_token: "0", qbo_updated_at: "2026-10-01T00:00:00Z", read_at: "2026-10-02T00:00:00Z" };
    expect((await t.dbs.admin.from("qbo_customer_snapshots").insert(row)).error).not.toBeNull();
    expect((await admin.from("qbo_customer_snapshots").insert(row)).error).not.toBeNull();
  });

  it("enforces decision shape, tenant references and per-pair uniqueness", async () => {
    const t = await fresh();
    const o = await fresh();
    seedSnapshot(t.breweryId, "a");
    const d = (decision: string, customerId: string | null, snapshot = "a") => () => decide(t.breweryId, t.adminUserId, snapshot, decision, customerId);
    expect(d("not_a_match", null)).toThrow("SQLSTATE 23514");
    expect(d("ignore", t.customerId)).toThrow("SQLSTATE 23514");
    expect(d("not_a_match", o.customerId)).toThrow("SQLSTATE 23503"); // foreign-tenant customer
    expect(d("not_a_match", t.customerId, "missing")).toThrow("SQLSTATE 23503"); // nonexistent snapshot
    expect(d("not_a_match", t.customerId)).not.toThrow();
    expect(d("not_a_match", t.customerId)).toThrow("SQLSTATE 23505");
    expect(d("ignore", null)).not.toThrow();
    expect(d("ignore", null)).toThrow("SQLSTATE 23505");
  });

  it("lets only admin and sales read their own brewery's decisions", async () => {
    const t = await fresh();
    const o = await fresh();
    for (const x of [t, o]) {
      seedSnapshot(x.breweryId, "a");
      decide(x.breweryId, x.adminUserId, "a", "ignore", null);
    }
    for (const who of ["admin", "sales"] as const) {
      const { data } = await t.dbs[who].from("qbo_customer_decisions").select("brewery_id");
      expect(data, who).toEqual([{ brewery_id: t.breweryId }]);
    }
    for (const who of ["warehouse", "buyer"] as const) {
      const { data } = await t.dbs[who].from("qbo_customer_decisions").select("id");
      expect(data, who).toEqual([]);
    }
  });
});
