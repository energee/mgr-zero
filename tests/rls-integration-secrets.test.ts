// tests/rls-integration-secrets.test.ts — proves browser clients never receive integration tokens.
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Ctx } from "@/lib/commands/registry";
import { readIntegrationTokens, storeIntegrationTokens } from "@/lib/supabase/integration-tokens";
import { admin, asUser, makeBrewery, makeCustomerUser, makeStaff } from "./helpers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54341";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type BrowserClient = { name: string; db: SupabaseClient };

describe("integration token isolation", () => {
  let brewery: { id: string };
  let browsers: BrowserClient[];
  let adminCtx: Ctx;
  let salesCtx: Ctx;
  let warehouseCtx: Ctx;

  beforeAll(async () => {
    brewery = await makeBrewery();
    const [adminUser, salesUser, warehouseUser, brewerUser] = await Promise.all([
      makeStaff(brewery.id, "admin"),
      makeStaff(brewery.id, "sales"),
      makeStaff(brewery.id, "warehouse"),
      makeStaff(brewery.id, "brewer"),
    ]);
    const { data: customer, error: customerError } = await admin
      .from("customers")
      .insert({ brewery_id: brewery.id, name: `secret customer ${crypto.randomUUID()}`, state: "PA" })
      .select()
      .single();
    expect(customerError).toBeNull();
    const customerUser = await makeCustomerUser(customer!.id);

    const { error: qboError } = await admin.from("qbo_connections").insert({
      brewery_id: brewery.id,
      realm_id: `realm-${crypto.randomUUID()}`,
    });
    expect(qboError).toBeNull();
    const { error: posError } = await admin.from("pos_connections").insert({
      brewery_id: brewery.id,
      provider: "square",
      merchant_id: `merchant-${crypto.randomUUID()}`,
    });
    expect(posError).toBeNull();

    const [adminDb, salesDb, warehouseDb, brewerDb, customerDb] = await Promise.all([
      asUser(adminUser.email),
      asUser(salesUser.email),
      asUser(warehouseUser.email),
      asUser(brewerUser.email),
      asUser(customerUser.email),
    ]);
    adminCtx = { db: adminDb, userId: adminUser.id, breweryId: brewery.id, role: "admin" };
    salesCtx = { db: salesDb, userId: salesUser.id, breweryId: brewery.id, role: "sales" };
    warehouseCtx = { db: warehouseDb, userId: warehouseUser.id, breweryId: brewery.id, role: "warehouse" };
    browsers = [
      { name: "admin", db: adminDb },
      { name: "sales", db: salesDb },
      { name: "warehouse", db: warehouseDb },
      { name: "brewer", db: brewerDb },
      { name: "customer", db: customerDb },
      { name: "anon", db: createClient(URL, ANON, { auth: { persistSession: false } }) },
    ];
  });

  it("denies every browser role reading or writing QBO token columns", async () => {
    for (const { name, db } of browsers) {
      const [{ data: readData, error: readError }, { data: writeData, error: writeError }] = await Promise.all([
        db.from("qbo_connections").select("access_token, refresh_token").eq("brewery_id", brewery.id),
        db.from("qbo_connections")
          .update({ access_token: "browser-access-token", refresh_token: "browser-refresh-token" })
          .eq("brewery_id", brewery.id)
          .select("access_token, refresh_token"),
      ]);
      expect({ name, readData, readError, writeData, writeError }).toMatchObject({
        name,
        readError: expect.anything(),
        writeError: expect.anything(),
      });
    }
  });

  it("denies every browser role reading or writing POS token columns", async () => {
    for (const { name, db } of browsers) {
      const [{ data: readData, error: readError }, { data: writeData, error: writeError }] = await Promise.all([
        db.from("pos_connections").select("access_token, refresh_token").eq("brewery_id", brewery.id),
        db.from("pos_connections")
          .update({ access_token: "browser-access-token", refresh_token: "browser-refresh-token" })
          .eq("brewery_id", brewery.id)
          .select("access_token, refresh_token"),
      ]);
      expect({ name, readData, readError, writeData, writeError }).toMatchObject({
        name,
        readError: expect.anything(),
        writeError: expect.anything(),
      });
    }
  });

  it("denies every browser role the private relation and token RPCs", async () => {
    for (const { name, db } of browsers) {
      const [{ error: relationError }, { error: readError }, { error: storeError }] = await Promise.all([
        db.schema("private").from("integration_tokens").select("access_token, refresh_token"),
        db.rpc("read_integration_tokens", { p_brewery: brewery.id, p_provider: "qbo" }),
        db.rpc("store_integration_tokens", {
          p_brewery: brewery.id,
          p_provider: "qbo",
          p_access_token: "browser-access-token",
          p_refresh_token: "browser-refresh-token",
        }),
      ]);
      expect({ name, relationError, readError, storeError }).toMatchObject({
        name,
        relationError: expect.anything(),
        readError: expect.anything(),
        storeError: expect.anything(),
      });
    }
  });

  it("stores and reads tokens through the RLS-bound admin and sales server boundary", async () => {
    await storeIntegrationTokens(adminCtx, {
      provider: "qbo",
      accessToken: "server-access-token",
      refreshToken: "server-refresh-token",
    });
    await storeIntegrationTokens(salesCtx, {
      provider: "square",
      accessToken: "square-access-token",
      refreshToken: "square-refresh-token",
    });

    await expect(readIntegrationTokens(salesCtx, "qbo")).resolves.toEqual({
      accessToken: "server-access-token",
      refreshToken: "server-refresh-token",
    });
    await expect(readIntegrationTokens(adminCtx, "square")).resolves.toEqual({
      accessToken: "square-access-token",
      refreshToken: "square-refresh-token",
    });
  });

  it("rejects server token access outside the integration roles or visible tenant connection", async () => {
    await expect(readIntegrationTokens(warehouseCtx, "qbo")).rejects.toMatchObject({ status: 403 });
    const otherBrewery = await makeBrewery();
    const forgedCtx: Ctx = { ...adminCtx, breweryId: otherBrewery.id };
    await expect(readIntegrationTokens(forgedCtx, "qbo")).rejects.toMatchObject({ status: 403 });
  });
});
