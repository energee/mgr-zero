// tests/null-role-guards.test.ts — #895: a signed-in user who is not a member
// of a brewery must be refused by every QuickBooks RPC on that brewery.
// public.staff_role(b) is NULL for a non-member, and `NULL <> 'admin'` is NULL,
// so a guard written that way never raised. Each case runs against a brewery
// that has a connected QuickBooks company, a customer, a SKU, and an invoice,
// so the role guard is the only thing that can refuse the call.
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, seedCustomer } from "./helpers";

let outsider: SupabaseClient<Database>;
let brewery: string;
let customer: string;
let sku: string;
let invoice: string;

beforeAll(async () => {
  // The outsider is an admin of their own brewery, never of `brewery`.
  outsider = (await makeStaffCtx((await makeBrewery()).id, "admin")).db;
  brewery = (await makeBrewery()).id;
  customer = (await seedCustomer(brewery)).customerId;
  sku = (await seedCatalog(brewery)).skuId;
  await admin.from("qbo_connections")
    .insert({ brewery_id: brewery, realm_id: `realm-${crypto.randomUUID()}`, state: "connected" }).throwOnError();
  invoice = (await admin.from("invoices")
    .insert({ brewery_id: brewery, customer_id: customer, issued_on: "2026-09-09" })
    .select("id").single().throwOnError()).data.id;
});

describe("QuickBooks RPCs refuse a non-member (#895)", () => {
  const calls: [string, () => PromiseLike<{ error: { message: string } | null; data: unknown }>][] = [
    ["begin_qbo_oauth", () => outsider.rpc("begin_qbo_oauth", {
      p_brewery: brewery, p_redirect_uri: "https://mgr.test/api/integrations/qbo/oauth",
      p_state_hash: crypto.randomUUID(), p_provider_intent: "connect", p_request_id: crypto.randomUUID(),
    })],
    ["set_qbo_push_defaults", () => outsider.rpc("set_qbo_push_defaults", {
      p_brewery: brewery, p_allow_ach: true, p_allow_card: true, p_request_id: crypto.randomUUID(),
    })],
    ["set_qbo_deposit_mapping", () => outsider.rpc("set_qbo_deposit_mapping", {
      p_brewery: brewery, p_qbo_item_id: "deposit-item", p_request_id: crypto.randomUUID(),
    })],
    ["set_qbo_item_mapping", () => outsider.rpc("set_qbo_item_mapping", {
      p_brewery: brewery, p_sku: sku, p_qbo_item_id: "item", p_request_id: crypto.randomUUID(),
    })],
    ["set_qbo_customer_mapping", () => outsider.rpc("set_qbo_customer_mapping", {
      p_brewery: brewery, p_customer: customer, p_qbo_customer_id: "customer", p_request_id: crypto.randomUUID(),
    })],
    // A null reason is a first push.
    ["start_qbo_push", () => outsider.rpc("start_qbo_push", {
      p_brewery: brewery, p_invoice: invoice, p_new_attempt_reason: null, p_request_id: crypto.randomUUID(),
    })],
  ];

  it.each(calls)("%s raises permission denied", async (_name, call) => {
    const { data, error } = await call();
    expect(data).toBeNull();
    expect(error?.message).toBe("permission denied");
  });
});
