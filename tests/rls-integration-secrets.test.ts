// tests/rls-integration-secrets.test.ts — proves browser clients never receive integration tokens.
import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Ctx } from "@/lib/commands/registry";
import { readIntegrationTokens, storeIntegrationTokens } from "@/lib/supabase/integration-tokens";
import { admin, asUser, makeBrewery, makeCustomerUser, makeStaff } from "./helpers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54341";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const DB = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";

function privateTokenCount(breweryId: string, provider: "qbo" | "square") {
  const sql = `select count(*) from private.integration_tokens where brewery_id = '${breweryId}'::uuid and provider = '${provider}'`;
  return Number(execFileSync("psql", [DB, "-Atc", sql], { encoding: "utf8" }).trim());
}

type BrowserClient = { name: string; db: SupabaseClient };

describe("integration token isolation", () => {
  let brewery: { id: string };
  let browsers: BrowserClient[];
  let adminCtx: Ctx;
  let salesCtx: Ctx;
  let warehouseCtx: Ctx;
  let qboConnectionId: string;
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

    const { data: qboConnection, error: qboError } = await admin.from("qbo_connections").insert({
      brewery_id: brewery.id,
      realm_id: `realm-${crypto.randomUUID()}`,
    }).select("id").single();
    expect(qboError).toBeNull();
    qboConnectionId = qboConnection!.id;
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
        db.rpc("read_integration_tokens", {
          p_brewery: brewery.id,
          p_provider: "qbo",
          p_connection: qboConnectionId,
          p_actor: adminCtx.userId,
        }),
        db.rpc("store_integration_tokens", {
          p_brewery: brewery.id,
          p_provider: "qbo",
          p_connection: qboConnectionId,
          p_actor: adminCtx.userId,
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

  it("rechecks current actor membership inside the service-only token statements", async () => {
    const { error: demoteError } = await admin
      .from("brewery_users")
      .update({ role: "brewer" })
      .eq("brewery_id", brewery.id)
      .eq("user_id", adminCtx.userId);
    expect(demoteError).toBeNull();

    try {
      const { data: storeData, error: storeError } = await admin.rpc("store_integration_tokens", {
        p_brewery: brewery.id,
        p_provider: "qbo",
        p_connection: qboConnectionId,
        p_actor: adminCtx.userId,
        p_access_token: "revoked-access-token",
        p_refresh_token: "revoked-refresh-token",
      });
      const { data: readData, error: readError } = await admin
        .rpc("read_integration_tokens", {
          p_brewery: brewery.id,
          p_provider: "qbo",
          p_connection: qboConnectionId,
          p_actor: adminCtx.userId,
        })
        .maybeSingle();
      expect(storeError).toBeNull();
      expect(storeData).toBe(false);
      expect(readError).toBeNull();
      expect(readData).toBeNull();
    } finally {
      const { error: restoreError } = await admin
        .from("brewery_users")
        .update({ role: "admin" })
        .eq("brewery_id", brewery.id)
        .eq("user_id", adminCtx.userId);
      expect(restoreError).toBeNull();
    }
  });

  it("rejects server token access outside the integration roles and across a real target tenant", async () => {
    await expect(readIntegrationTokens(warehouseCtx, "qbo")).rejects.toMatchObject({ status: 403 });
    const otherBrewery = await makeBrewery();
    const otherAdmin = await makeStaff(otherBrewery.id, "admin");
    const otherDb = await asUser(otherAdmin.email);
    const otherCtx: Ctx = { db: otherDb, userId: otherAdmin.id, breweryId: otherBrewery.id, role: "admin" };
    const { error: connectionError } = await admin.from("qbo_connections").insert({
      brewery_id: otherBrewery.id,
      realm_id: `realm-${crypto.randomUUID()}`,
    });
    expect(connectionError).toBeNull();
    await storeIntegrationTokens(otherCtx, {
      provider: "qbo",
      accessToken: "other-tenant-access-token",
      refreshToken: "other-tenant-refresh-token",
    });

    const forgedCtx: Ctx = { ...adminCtx, breweryId: otherBrewery.id };
    await expect(readIntegrationTokens(forgedCtx, "qbo")).rejects.toMatchObject({ status: 403 });
  });

  it("allows one POS connection per supported provider", async () => {
    const { error: duplicatePosError } = await admin.from("pos_connections").insert({
      brewery_id: brewery.id,
      provider: "square",
      merchant_id: `merchant-${crypto.randomUUID()}`,
    });
    expect(duplicatePosError?.code).toBe("23505");
  });

  it("physically purges QBO tokens only on actual connection lifecycle changes", async () => {


    const lifecycleBrewery = await makeBrewery();
    const lifecycleAdmin = await makeStaff(lifecycleBrewery.id, "admin");
    const lifecycleDb = await asUser(lifecycleAdmin.email);
    const lifecycleCtx: Ctx = {
      db: lifecycleDb,
      userId: lifecycleAdmin.id,
      breweryId: lifecycleBrewery.id,
      role: "admin",
    };
    const firstRealm = `realm-${crypto.randomUUID()}`;
    const { data: firstConnection, error: firstConnectionError } = await admin
      .from("qbo_connections")
      .insert({ brewery_id: lifecycleBrewery.id, realm_id: firstRealm })
      .select("id")
      .single();
    expect(firstConnectionError).toBeNull();
    await storeIntegrationTokens(lifecycleCtx, {
      provider: "qbo",
      accessToken: "old-access-token",
      refreshToken: "old-refresh-token",
    });
    expect(privateTokenCount(lifecycleBrewery.id, "qbo")).toBe(1);

    const { error: noOpError } = await admin
      .from("qbo_connections")
      .update({ realm_id: firstRealm })
      .eq("id", firstConnection!.id);
    expect(noOpError).toBeNull();
    await expect(readIntegrationTokens(lifecycleCtx, "qbo")).resolves.toEqual({
      accessToken: "old-access-token",
      refreshToken: "old-refresh-token",
    });
    expect(privateTokenCount(lifecycleBrewery.id, "qbo")).toBe(1);

    const { error: realmChangeError } = await admin
      .from("qbo_connections")
      .update({ realm_id: `realm-${crypto.randomUUID()}` })
      .eq("id", firstConnection!.id);
    expect(realmChangeError).toBeNull();
    expect(privateTokenCount(lifecycleBrewery.id, "qbo")).toBe(0);
    await storeIntegrationTokens(lifecycleCtx, {
      provider: "qbo",
      accessToken: "delete-access-token",
      refreshToken: "delete-refresh-token",
    });
    expect(privateTokenCount(lifecycleBrewery.id, "qbo")).toBe(1);


    const { error: deleteError } = await admin.from("qbo_connections").delete().eq("id", firstConnection!.id);
    expect(deleteError).toBeNull();
    expect(privateTokenCount(lifecycleBrewery.id, "qbo")).toBe(0);
    const { error: replacementError } = await admin.from("qbo_connections").insert({
      brewery_id: lifecycleBrewery.id,
      realm_id: `realm-${crypto.randomUUID()}`,
    });
    expect(replacementError).toBeNull();
    await expect(readIntegrationTokens(lifecycleCtx, "qbo")).rejects.toMatchObject({ status: 404 });

    const movedBrewery = await makeBrewery();
    const { data: movedConnection, error: movedConnectionError } = await admin
      .from("qbo_connections")
      .insert({ brewery_id: movedBrewery.id, realm_id: `realm-${crypto.randomUUID()}` })
      .select("id")
      .single();
    expect(movedConnectionError).toBeNull();
    const movedAdmin = await makeStaff(movedBrewery.id, "admin");
    const movedCtx: Ctx = {
      db: await asUser(movedAdmin.email),
      userId: movedAdmin.id,
      breweryId: movedBrewery.id,
      role: "admin",
    };
    await storeIntegrationTokens(movedCtx, {
      provider: "qbo",
      accessToken: "moved-access-token",
      refreshToken: "moved-refresh-token",
    });
    const moveTarget = await makeBrewery();
    const { error: moveError } = await admin
      .from("qbo_connections")
      .update({ brewery_id: moveTarget.id })
      .eq("id", movedConnection!.id);
    expect(moveError).toBeNull();
    expect(privateTokenCount(movedBrewery.id, "qbo")).toBe(0);
  });

  it("physically purges POS tokens on merchant identity changes", async () => {
    const posBrewery = await makeBrewery();
    const posAdmin = await makeStaff(posBrewery.id, "admin");
    const posCtx: Ctx = {
      db: await asUser(posAdmin.email),
      userId: posAdmin.id,
      breweryId: posBrewery.id,
      role: "admin",
    };
    const { data: posConnection, error: posConnectionError } = await admin
      .from("pos_connections")
      .insert({
        brewery_id: posBrewery.id,
        provider: "square",
        merchant_id: `merchant-${crypto.randomUUID()}`,
      })
      .select("id")
      .single();
    expect(posConnectionError).toBeNull();
    await storeIntegrationTokens(posCtx, {
      provider: "square",
      accessToken: "pos-access-token",
      refreshToken: "pos-refresh-token",
    });
    expect(privateTokenCount(posBrewery.id, "square")).toBe(1);

    const { error: merchantChangeError } = await admin
      .from("pos_connections")
      .update({ merchant_id: `merchant-${crypto.randomUUID()}` })
      .eq("id", posConnection!.id);
    expect(merchantChangeError).toBeNull();
    expect(privateTokenCount(posBrewery.id, "square")).toBe(0);
  });
});
