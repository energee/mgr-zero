// tests/chat-schema.test.ts — real-Postgres proof for provider-neutral chat tenancy and visibility.
import { describe, expect, it } from "vitest";
import { admin, asUser, makeBrewery, makeStaff, makeStaffCtx } from "./helpers";

const provider = "slack";

async function insert<T>(table: string, row: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.from(table).insert(row).select().single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as T;
}

async function installation(
  breweryId: string,
  installerUserId: string,
  externalInstallationId = `workspace-${crypto.randomUUID()}`,
) {
  return insert<{ id: string }>("chat_installations", {
    brewery_id: breweryId,
    provider,
    external_installation_id: externalInstallationId,
    display_label: "Test workspace",
    state: "active",
    installer_user_id: installerUserId,
    token_store_key: `chat-sdk/${crypto.randomUUID()}`,
  });
}

describe("chat schema (live DB)", () => {
  it("defaults reading cadence to 24 hours and rejects 0 or 169", async () => {
    const brewery = await makeBrewery();
    expect(brewery.fermentation_reading_due_hours).toBe(24);

    for (const hours of [0, 169]) {
      const { error } = await admin
        .from("breweries")
        .update({ fermentation_reading_due_hours: hours })
        .eq("id", brewery.id);
      expect(error?.code).toBe("23514");
    }
  });

  it("allows one active installation per brewery/provider", async () => {
    const brewery = await makeBrewery();
    const staff = await makeStaff(brewery.id);
    const current = await installation(brewery.id, staff.id);

    const duplicate = await admin.from("chat_installations").insert({
      brewery_id: brewery.id,
      provider,
      external_installation_id: `workspace-${crypto.randomUUID()}`,
      display_label: "Second workspace",
      state: "active",
      installer_user_id: staff.id,
      token_store_key: `chat-sdk/${crypto.randomUUID()}`,
    });
    expect(duplicate.error?.code).toBe("23505");

    const disconnected = await admin
      .from("chat_installations")
      .update({ state: "disconnected" })
      .eq("id", current.id);
    expect(disconnected.error).toBeNull();
    await expect(installation(brewery.id, staff.id)).resolves.toBeDefined();
  });

  it("prevents one Slack workspace from mapping to two breweries", async () => {
    const first = await makeBrewery();
    const second = await makeBrewery();
    const firstStaff = await makeStaff(first.id);
    const secondStaff = await makeStaff(second.id);
    const workspace = `workspace-${crypto.randomUUID()}`;
    await installation(first.id, firstStaff.id, workspace);

    const { error } = await admin.from("chat_installations").insert({
      brewery_id: second.id,
      provider,
      external_installation_id: workspace,
      display_label: "Duplicate workspace",
      state: "active",
      installer_user_id: secondStaff.id,
      token_store_key: `chat-sdk/${crypto.randomUUID()}`,
    });
    expect(error?.code).toBe("23505");
  });

  it("blocks cross-brewery reads for installations, links, destinations and preferences", async () => {
    const first = await makeBrewery();
    const second = await makeBrewery();
    const firstCtx = await makeStaffCtx(first.id);
    const secondCtx = await makeStaffCtx(second.id);
    const installationReader = await asUser((await makeStaff(first.id)).email);
    const firstInstallation = await installation(first.id, firstCtx.userId);
    const secondInstallation = await installation(second.id, secondCtx.userId);
    const firstDestination = await insert<{ id: string }>("notification_destinations", {
      brewery_id: first.id,
      installation_id: firstInstallation.id,
      kind: "personal",
      external_destination_id: `dm-${crypto.randomUUID()}`,
      user_id: firstCtx.userId,
      privacy_class: "direct",
      capabilities: {},
      state: "active",
    });
    const secondDestination = await insert<{ id: string }>("notification_destinations", {
      brewery_id: second.id,
      installation_id: secondInstallation.id,
      kind: "personal",
      external_destination_id: `dm-${crypto.randomUUID()}`,
      user_id: secondCtx.userId,
      privacy_class: "direct",
      capabilities: {},
      state: "active",
    });
    const firstLink = await insert<{ id: string }>("chat_user_links", {
      brewery_id: first.id,
      installation_id: firstInstallation.id,
      provider,
      external_user_id: `user-${crypto.randomUUID()}`,
      user_id: firstCtx.userId,
      state: "active",
    });
    const secondLink = await insert<{ id: string }>("chat_user_links", {
      brewery_id: second.id,
      installation_id: secondInstallation.id,
      provider,
      external_user_id: `user-${crypto.randomUUID()}`,
      user_id: secondCtx.userId,
      state: "active",
    });
    const firstPreference = await insert<{ id: string }>("notification_preferences", {
      brewery_id: first.id,
      user_id: firstCtx.userId,
      reason: "operations_digest",
      enabled: true,
      personal_destination_id: firstDestination.id,
      use_brewery_timezone: true,
    });
    const secondPreference = await insert<{ id: string }>("notification_preferences", {
      brewery_id: second.id,
      user_id: secondCtx.userId,
      reason: "operations_digest",
      enabled: true,
      personal_destination_id: secondDestination.id,
      use_brewery_timezone: true,
    });

    for (const [client, table, ownId, otherId] of [
      [installationReader, "chat_installations", firstInstallation.id, secondInstallation.id],
      [firstCtx.db, "chat_user_links", firstLink.id, secondLink.id],
      [firstCtx.db, "notification_destinations", firstDestination.id, secondDestination.id],
      [firstCtx.db, "notification_preferences", firstPreference.id, secondPreference.id],
    ] as const) {
      const own = await client.from(table).select("id").eq("id", ownId);
      expect(own.data).toEqual([{ id: ownId }]);
      const crossTenant = await client.from(table).select("id").eq("id", otherId);
      expect(crossTenant.data).toEqual([]);
    }
  });

  it("exposes no occurrence, delivery, callback receipt or action intent rows to authenticated users", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id);
    const chatInstallation = await installation(brewery.id, ctx.userId);
    const destination = await insert<{ id: string }>("notification_destinations", {
      brewery_id: brewery.id,
      installation_id: chatInstallation.id,
      kind: "personal",
      external_destination_id: `dm-${crypto.randomUUID()}`,
      user_id: ctx.userId,
      privacy_class: "direct",
      capabilities: {},
      state: "active",
    });
    const occurrence = await insert<{ id: string }>("notification_occurrences", {
      brewery_id: brewery.id,
      reason: "operations_digest",
      subject_type: "brewery",
      subject_id: brewery.id,
      source_version: "2026-09-01",
      occurred_at: new Date().toISOString(),
      owner_query: "digest",
      urgency: "normal",
      payload: {},
      semantic_key: `occurrence-${crypto.randomUUID()}`,
    });
    await insert("notification_deliveries", {
      brewery_id: brewery.id,
      occurrence_id: occurrence.id,
      destination_id: destination.id,
      installation_id: chatInstallation.id,
      provider,
      semantic_key: `delivery-${crypto.randomUUID()}`,
    });
    await insert("chat_callback_receipts", {
      brewery_id: brewery.id,
      installation_id: chatInstallation.id,
      provider,
      callback_id: `callback-${crypto.randomUUID()}`,
      callback_kind: "event_callback",
      disposition: "pending",
      payload_hash: `sha256:${crypto.randomUUID()}`,
      received_at: new Date().toISOString(),
    });
    await insert("chat_action_intents", {
      brewery_id: brewery.id,
      installation_id: chatInstallation.id,
      user_id: ctx.userId,
      provider,
      action_origin_hash: `sha256:${crypto.randomUUID()}`,
      command_name: "dismiss_notification",
      input_hash: `sha256:${crypto.randomUUID()}`,
      subject_type: "brewery",
      subject_id: brewery.id,
      subject_version: "2026-09-01",
      request_id: crypto.randomUUID(),
      preview_token_hash: `sha256:${crypto.randomUUID()}`,
      allowed_action: "dismiss",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    for (const table of [
      "notification_occurrences",
      "notification_deliveries",
      "chat_callback_receipts",
      "chat_action_intents",
    ]) {
      const { data, error } = await ctx.db.from(table).select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it("enforces installation-scoped external user and destination uniqueness", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id);
    const chatInstallation = await installation(brewery.id, ctx.userId);
    const externalUser = `user-${crypto.randomUUID()}`;
    const externalDestination = `dm-${crypto.randomUUID()}`;

    await insert("chat_user_links", {
      brewery_id: brewery.id,
      installation_id: chatInstallation.id,
      provider,
      external_user_id: externalUser,
      user_id: ctx.userId,
      state: "active",
    });
    const duplicateUser = await admin.from("chat_user_links").insert({
      brewery_id: brewery.id,
      installation_id: chatInstallation.id,
      provider,
      external_user_id: externalUser,
      user_id: ctx.userId,
      state: "pending",
    });
    expect(duplicateUser.error?.code).toBe("23505");

    await insert("notification_destinations", {
      brewery_id: brewery.id,
      installation_id: chatInstallation.id,
      kind: "personal",
      external_destination_id: externalDestination,
      user_id: ctx.userId,
      privacy_class: "direct",
      capabilities: {},
      state: "active",
    });
    const duplicateDestination = await admin.from("notification_destinations").insert({
      brewery_id: brewery.id,
      installation_id: chatInstallation.id,
      kind: "personal",
      external_destination_id: externalDestination,
      user_id: ctx.userId,
      privacy_class: "direct",
      capabilities: {},
      state: "blocked",
    });
    expect(duplicateDestination.error?.code).toBe("23505");
  });
});
