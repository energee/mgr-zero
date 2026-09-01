// tests/chat-schema.test.ts — real-Postgres proof for provider-neutral chat tenancy and visibility.
import { execFileSync } from "node:child_process";
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
  tokenStoreKey = `chat-sdk/${crypto.randomUUID()}`,
) {
  return insert<{ id: string }>("chat_installations", {
    brewery_id: breweryId,
    provider,
    external_installation_id: externalInstallationId,
    display_label: "Test workspace",
    state: "active",
    installer_user_id: installerUserId,
    token_store_key: tokenStoreKey,
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
      expect(data).toBeNull();
      expect(error?.code).toBe("42501");
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
      state: "pending", // pending links carry no user_id yet
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

  it("denies direct re-parenting, lifecycle, and server-field updates", async () => {
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
    const link = await insert<{ id: string }>("chat_user_links", {
      brewery_id: brewery.id,
      installation_id: chatInstallation.id,
      provider,
      external_user_id: `user-${crypto.randomUUID()}`,
      user_id: ctx.userId,
      state: "active",
    });
    const preference = await insert<{ id: string }>("notification_preferences", {
      brewery_id: brewery.id,
      user_id: ctx.userId,
      reason: "operations_digest",
      enabled: true,
      personal_destination_id: destination.id,
      use_brewery_timezone: true,
    });

    for (const [table, id, update] of [
      ["chat_user_links", link.id, { state: "disabled", external_user_id: "re-parented" }],
      ["notification_destinations", destination.id, { state: "blocked", blocked_reason: "user-written" }],
      ["notification_preferences", preference.id, { enabled: false }],
    ] as const) {
      const { error } = await ctx.db.from(table).update(update).eq("id", id);
      expect(error?.code, table).toBe("42501");
    }
  });

  it("requires current membership and an active same-brewery link for personal reads", async () => {
    const removed = await makeBrewery();
    const removedCtx = await makeStaffCtx(removed.id);
    const removedInstallation = await installation(removed.id, removedCtx.userId);
    const removedDestination = await insert<{ id: string }>("notification_destinations", {
      brewery_id: removed.id,
      installation_id: removedInstallation.id,
      kind: "personal",
      external_destination_id: `dm-${crypto.randomUUID()}`,
      user_id: removedCtx.userId,
      privacy_class: "direct",
      capabilities: {},
      state: "active",
    });
    await insert("chat_user_links", {
      brewery_id: removed.id,
      installation_id: removedInstallation.id,
      provider,
      external_user_id: `user-${crypto.randomUUID()}`,
      user_id: removedCtx.userId,
      state: "active",
    });
    const removedPreference = await insert<{ id: string }>("notification_preferences", {
      brewery_id: removed.id,
      user_id: removedCtx.userId,
      reason: "operations_digest",
      enabled: true,
      personal_destination_id: removedDestination.id,
      use_brewery_timezone: true,
    });
    await admin.from("brewery_users").delete().eq("brewery_id", removed.id).eq("user_id", removedCtx.userId);

    for (const [table, id] of [
      ["notification_destinations", removedDestination.id],
      ["notification_preferences", removedPreference.id],
    ] as const) {
      const { data } = await removedCtx.db.from(table).select("id").eq("id", id);
      expect(data, `${table} after membership removal`).toEqual([]);
    }

    const disabled = await makeBrewery();
    const disabledCtx = await makeStaffCtx(disabled.id);
    const disabledInstallation = await installation(disabled.id, disabledCtx.userId);
    const disabledDestination = await insert<{ id: string }>("notification_destinations", {
      brewery_id: disabled.id,
      installation_id: disabledInstallation.id,
      kind: "personal",
      external_destination_id: `dm-${crypto.randomUUID()}`,
      user_id: disabledCtx.userId,
      privacy_class: "direct",
      capabilities: {},
      state: "active",
    });
    const disabledLink = await insert<{ id: string }>("chat_user_links", {
      brewery_id: disabled.id,
      installation_id: disabledInstallation.id,
      provider,
      external_user_id: `user-${crypto.randomUUID()}`,
      user_id: disabledCtx.userId,
      state: "active",
    });
    const disabledPreference = await insert<{ id: string }>("notification_preferences", {
      brewery_id: disabled.id,
      user_id: disabledCtx.userId,
      reason: "operations_digest",
      enabled: true,
      personal_destination_id: disabledDestination.id,
      use_brewery_timezone: true,
    });
    await admin.from("chat_user_links").update({ state: "disabled" }).eq("id", disabledLink.id);

    for (const [table, id] of [
      ["chat_user_links", disabledLink.id],
      ["notification_destinations", disabledDestination.id],
      ["notification_preferences", disabledPreference.id],
    ] as const) {
      const { data } = await disabledCtx.db.from(table).select("id").eq("id", id);
      expect(data, `${table} after link disable`).toEqual([]);
    }

    await admin.from("chat_user_links").update({ state: "unlinked" }).eq("id", disabledLink.id);
    const { data: unlinked } = await disabledCtx.db.from("chat_user_links").select("id").eq("id", disabledLink.id);
    expect(unlinked, "chat_user_links after unlink").toEqual([]);
  });

  it("requires preferences to name the same user's personal direct destination", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id);
    const chatInstallation = await installation(brewery.id, ctx.userId);
    const shared = await insert<{ id: string }>("notification_destinations", {
      brewery_id: brewery.id,
      installation_id: chatInstallation.id,
      kind: "private_channel",
      external_destination_id: `channel-${crypto.randomUUID()}`,
      privacy_class: "private_internal",
      capabilities: {},
      state: "active",
    });
    const otherUser = await makeStaff(brewery.id);
    const otherDestination = await insert<{ id: string }>("notification_destinations", {
      brewery_id: brewery.id,
      installation_id: chatInstallation.id,
      kind: "personal",
      external_destination_id: `dm-${crypto.randomUUID()}`,
      user_id: otherUser.id,
      privacy_class: "direct",
      capabilities: {},
      state: "active",
    });

    for (const [reason, destinationId] of [
      ["operations_digest", shared.id],
      ["submitted_order", otherDestination.id],
    ]) {
      const { error } = await admin.from("notification_preferences").insert({
        brewery_id: brewery.id,
        user_id: ctx.userId,
        reason,
        enabled: true,
        personal_destination_id: destinationId,
        use_brewery_timezone: true,
      });
      expect(error?.code, reason).toBe("23503");
    }
  });

  it("limits admin installation reads to health columns", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id);
    const chatInstallation = await insert<{ id: string }>("chat_installations", {
      brewery_id: brewery.id,
      provider,
      external_installation_id: `workspace-${crypto.randomUUID()}`,
      display_label: "Test workspace",
      state: "active",
      oauth_intent_hash: "hash-that-must-not-be-readable",
      installer_user_id: ctx.userId,
      token_store_key: `chat-sdk/${crypto.randomUUID()}`,
    });

    const health = await ctx.db
      .from("chat_installations")
      .select("id, state, last_health_checked_at, last_failure_code")
      .eq("id", chatInstallation.id);
    expect(health.data).toEqual([{ id: chatInstallation.id, state: "active", last_health_checked_at: null, last_failure_code: null }]);
    const sensitive = await ctx.db
      .from("chat_installations")
      .select("oauth_intent_hash, token_store_key")
      .eq("id", chatInstallation.id);
    expect(sensitive.error?.code).toBe("42501");
  });

  it("enforces parent provider consistency and unique token-store keys", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id);
    const key = `chat-sdk/${crypto.randomUUID()}`;
    const chatInstallation = await installation(brewery.id, ctx.userId, undefined, key);
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
    const providerMismatch = await admin.from("chat_user_links").insert({
      brewery_id: brewery.id,
      installation_id: chatInstallation.id,
      provider: "discord",
      external_user_id: `user-${crypto.randomUUID()}`,
      user_id: ctx.userId,
      state: "active",
    });
    expect(providerMismatch.error?.code).toBe("23503");

    for (const [table, row] of [
      [
        "notification_deliveries",
        {
          brewery_id: brewery.id,
          occurrence_id: occurrence.id,
          destination_id: destination.id,
          installation_id: chatInstallation.id,
          provider: "discord",
          semantic_key: `delivery-${crypto.randomUUID()}`,
        },
      ],
      [
        "chat_callback_receipts",
        {
          brewery_id: brewery.id,
          installation_id: chatInstallation.id,
          provider: "discord",
          callback_id: `callback-${crypto.randomUUID()}`,
          callback_kind: "event_callback",
          disposition: "pending",
          payload_hash: `sha256:${crypto.randomUUID()}`,
          received_at: new Date().toISOString(),
        },
      ],
      [
        "chat_action_intents",
        {
          brewery_id: brewery.id,
          installation_id: chatInstallation.id,
          user_id: ctx.userId,
          provider: "discord",
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
        },
      ],
    ] as const) {
      const { error } = await admin.from(table).insert(row);
      expect(error?.code, table).toBe("23503");
    }

    const otherBrewery = await makeBrewery();
    const otherStaff = await makeStaff(otherBrewery.id);
    const duplicateKey = await admin.from("chat_installations").insert({
      brewery_id: otherBrewery.id,
      provider,
      external_installation_id: `workspace-${crypto.randomUUID()}`,
      display_label: "Other workspace",
      state: "active",
      installer_user_id: otherStaff.id,
      token_store_key: key,
    });
    expect(duplicateKey.error?.code).toBe("23505");
  });

  it("indexes every chat-table foreign key by its leading columns", () => {
    const databaseUrl = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";
    const missing = execFileSync(
      "psql",
      [
        databaseUrl,
        "-Atc",
        `
          select c.conrelid::regclass || ':' || c.conname
          from pg_constraint c
          join pg_class t on t.oid = c.conrelid
          where c.contype = 'f'
            and t.relnamespace = 'public'::regnamespace
            and t.relname in (
              'chat_installations',
              'chat_user_links',
              'notification_destinations',
              'notification_preferences',
              'notification_occurrences',
              'notification_deliveries',
              'chat_callback_receipts',
              'chat_action_intents'
            )
            and not exists (
              select 1
              from pg_index i
              where i.indrelid = c.conrelid
                and i.indisvalid
                and i.indpred is null
                and (i.indkey::smallint[])[0:array_length(c.conkey, 1) - 1] = c.conkey
            )
          order by 1
        `,
      ],
      { encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter(Boolean);

    expect(missing).toEqual([]);
  });
});
