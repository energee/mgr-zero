import { assert } from "vitest";
// tests/chat-linking.test.ts — explicit Slack→staff linking: single-use hashed
// proofs, installation/external-user binding, membership checks, customer
// rejection, replay, unlink, and per-callback actor revalidation (live DB).
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { admin, asUser, makeBrewery, makeCustomerUser, makeStaff, makeStaffCtx, seedCustomer } from "./helpers";
import { issueChatLinkProof, resolveChatActor } from "@/lib/chat/linking";
import { runCommand } from "@/lib/commands/registry";
import type { ChatLinkIntent } from "@/lib/commands/chat";
import "@/lib/commands/all";

process.env.APP_URL ??= "https://mgr.test";

async function activeInstallation(breweryId: string, installerUserId: string, state = "active") {
  const teamId = `T${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await admin.from("chat_installations").insert({
    brewery_id: breweryId, provider: "slack", external_installation_id: teamId, display_label: "Demo",
    state, installer_user_id: installerUserId, token_store_key: `slack:installation:${teamId}`,
  }).select().single();
  if (error) throw error;
  return data as { id: string; external_installation_id: string };
}

const linkRow = async (id: string) => (await admin.from("chat_user_links").select().eq("id", id).single()).data!;

describe("staff linking", () => {
  it("issues a hashed ten-minute single-use proof bound to installation and external user", async () => {
    const b = await makeBrewery();
    const ctx = await makeStaffCtx(b.id);
    const inst = await activeInstallation(b.id, ctx.userId);
    const issued = await issueChatLinkProof(admin, inst.id, "U100", "Morgan Slack");
    expect(issued.url).toBe(`${process.env.APP_URL}/settings/chat/link?proof=${encodeURIComponent(issued.proof)}`);
    const r = await linkRow(issued.linkId);
    expect(r.state).toBe("pending");
    expect(r.user_id).toBeNull();
    expect(r.external_user_id).toBe("U100");
    expect(r.proof_hash).toBe(createHash("sha256").update(issued.proof).digest("hex"));
    expect(JSON.stringify(r)).not.toContain(issued.proof);
    assert(r.proof_expires_at !== null);
    const ttl = new Date(r.proof_expires_at).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(9 * 60_000);
    expect(ttl).toBeLessThanOrEqual(11 * 60_000);
  });

  it("previews the provider display name, both stable Slack ids, and MGR account email", async () => {
    const b = await makeBrewery();
    const ctx = await makeStaffCtx(b.id);
    const inst = await activeInstallation(b.id, ctx.userId);
    const account = await admin.auth.admin.getUserById(ctx.userId);
    expect((await admin.auth.admin.updateUserById(ctx.userId, { user_metadata: { full_name: "Owner (Admin)" } })).error).toBeNull();
    const issued = await issueChatLinkProof(admin, inst.id, "U-DISPLAY", "Morgan Slack");
    const preview = await runCommand("get_chat_link_intent", { proof: issued.proof }, ctx) as ChatLinkIntent;
    expect(preview.slackIdentity).toContain("Morgan Slack");
    expect(preview.slackIdentity).toContain("U-DISPLAY");
    expect(preview.workspace).toContain("Demo");
    expect(preview.workspace).toContain(inst.external_installation_id);
    expect(preview.mgrIdentity).toContain("Owner (Admin)");
    expect(preview.mgrIdentity).toContain(account.data.user!.email!);
    expect((await linkRow(issued.linkId)).state).toBe("pending");
    const blank = await admin.rpc("issue_chat_link_proof", {
      p_installation: inst.id, p_external_user_id: "U-BLANK", p_proof_hash: "a".repeat(64), p_external_display_name: " ",
    });
    expect(blank.error?.message).toContain("display name required");
  });

  it("refuses to issue for an installation that is not active", async () => {
    const b = await makeBrewery();
    const ctx = await makeStaffCtx(b.id);
    const inst = await activeInstallation(b.id, ctx.userId, "disabled");
    await expect(issueChatLinkProof(admin, inst.id, "U100", "Morgan Slack")).rejects.toThrow(/not active/i);
  });

  it("consumes a proof once for a current staff member and resolves all live roles", async () => {
    const b = await makeBrewery();
    const ctx = await makeStaffCtx(b.id, ["sales", "warehouse"]);
    const inst = await activeInstallation(b.id, ctx.userId);
    const issued = await issueChatLinkProof(admin, inst.id, "U200", "Morgan Slack");
    const result = await runCommand("consume_chat_link_proof", { proof: issued.proof }, ctx);
    expect(result).toEqual({ linkId: issued.linkId, installationId: inst.id, breweryId: b.id });
    const r = await linkRow(issued.linkId);
    expect(r.state).toBe("active");
    expect(r.user_id).toBe(ctx.userId);
    expect(r.proof_hash).toBeNull();
    expect(r.proof_consumed_at).not.toBeNull();

    await expect(runCommand("consume_chat_link_proof", { proof: issued.proof }, ctx)).rejects.toThrow(/invalid|expired/i);

    await expect(resolveChatActor(admin, "slack", inst.external_installation_id, "U200")).resolves.toEqual({
      installationId: inst.id, breweryId: b.id, externalUserId: "U200", userId: ctx.userId, roles: ["sales", "warehouse"],
    });
    expect((await admin.from("brewery_users").update({ roles: ["brewer", "taproom"] }).eq("user_id", ctx.userId).eq("brewery_id", b.id)).error).toBeNull();
    expect((await resolveChatActor(admin, "slack", inst.external_installation_id, "U200"))?.roles).toEqual(["brewer", "taproom"]);
  });

  it("rejects expired proofs, forged proofs, customers, and members of another brewery", async () => {
    const b = await makeBrewery();
    const staff = await makeStaffCtx(b.id);
    const inst = await activeInstallation(b.id, staff.userId);

    await expect(runCommand("consume_chat_link_proof", { proof: "forged" }, staff)).rejects.toThrow(/invalid|expired/i);

    const expired = await issueChatLinkProof(admin, inst.id, "U300", "Morgan Slack");
    await admin.from("chat_user_links").update({ proof_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", expired.linkId);
    await expect(runCommand("consume_chat_link_proof", { proof: expired.proof }, staff)).rejects.toThrow(/invalid|expired/i);

    const customer = { id: (await seedCustomer(b.id, { name: "Cust" })).customerId };
    const customerUser = await makeCustomerUser(customer.id);
    const customerCtx = { db: await asUser(customerUser.email), userId: customerUser.id, breweryId: b.id, roles: ["customer" as const], customerId: customer.id };
    const forCustomer = await issueChatLinkProof(admin, inst.id, "U301", "Morgan Slack");
    await expect(runCommand("consume_chat_link_proof", { proof: forCustomer.proof }, customerCtx)).rejects.toThrow(/permission/i);
    expect((await linkRow(forCustomer.linkId)).state).toBe("pending");

    const outsider = await makeStaffCtx((await makeBrewery()).id);
    const forOutsider = await issueChatLinkProof(admin, inst.id, "U302", "Morgan Slack");
    await expect(runCommand("consume_chat_link_proof", { proof: forOutsider.proof }, outsider)).rejects.toThrow(/member|permission/i);
    expect((await linkRow(forOutsider.linkId)).state).toBe("pending");
  });

  it("re-issuing a proof replaces the pending one and an active link cannot be re-issued", async () => {
    const b = await makeBrewery();
    const ctx = await makeStaffCtx(b.id);
    const inst = await activeInstallation(b.id, ctx.userId);
    const first = await issueChatLinkProof(admin, inst.id, "U400", "Morgan Slack");
    const second = await issueChatLinkProof(admin, inst.id, "U400", "Morgan Slack");
    expect(second.linkId).toBe(first.linkId);
    await expect(runCommand("consume_chat_link_proof", { proof: first.proof }, ctx)).rejects.toThrow(/invalid|expired/i);
    await runCommand("consume_chat_link_proof", { proof: second.proof }, ctx);
    await expect(issueChatLinkProof(admin, inst.id, "U400", "Morgan Slack")).rejects.toThrow(/already linked/i);
  });

  it("stops resolving after unlink, membership removal, or installation disable", async () => {
    const b = await makeBrewery();
    const ctx = await makeStaffCtx(b.id, "sales");
    const inst = await activeInstallation(b.id, ctx.userId);
    const issued = await issueChatLinkProof(admin, inst.id, "U500", "Morgan Slack");
    await runCommand("consume_chat_link_proof", { proof: issued.proof }, ctx);
    const status = await runCommand("get_chat_link_status", { installationId: inst.id }, ctx);
    expect(status).toMatchObject({ linked: true, linkId: issued.linkId });

    const other = await makeStaffCtx(b.id, "sales");
    await expect(runCommand("unlink_chat_user", { linkId: issued.linkId }, other)).rejects.toThrow(/permission|not found/i);
    await runCommand("unlink_chat_user", { linkId: issued.linkId }, ctx);
    expect((await linkRow(issued.linkId)).state).toBe("unlinked");
    await expect(resolveChatActor(admin, "slack", inst.external_installation_id, "U500")).resolves.toBeNull();
    expect(await runCommand("get_chat_link_status", { installationId: inst.id }, ctx)).toEqual({ linked: false });

    const again = await issueChatLinkProof(admin, inst.id, "U500", "Morgan Slack");
    await runCommand("consume_chat_link_proof", { proof: again.proof }, ctx);
    await admin.from("brewery_users").delete().eq("user_id", ctx.userId).eq("brewery_id", b.id);
    await expect(resolveChatActor(admin, "slack", inst.external_installation_id, "U500")).resolves.toBeNull();

    const removedStaff = await makeStaff(b.id, "brewer");
    const removedCtx = { db: await asUser(removedStaff.email), userId: removedStaff.id, breweryId: b.id, roles: ["brewer" as const] };
    const third = await issueChatLinkProof(admin, inst.id, "U501", "Morgan Slack");
    await runCommand("consume_chat_link_proof", { proof: third.proof }, removedCtx);
    await admin.from("chat_installations").update({ state: "disabled", disabled_at: new Date().toISOString() }).eq("id", inst.id);
    await expect(resolveChatActor(admin, "slack", inst.external_installation_id, "U501")).resolves.toBeNull();
  });

  it("lets a combined-role admin list role arrays and unlink another member but denies nonmembers", async () => {
    const b = await makeBrewery();
    const adminCtx = await makeStaffCtx(b.id, ["admin", "sales"]);
    const member = await makeStaffCtx(b.id, ["sales", "warehouse"]);
    const outsider = await makeStaffCtx((await makeBrewery()).id, "admin");
    const inst = await activeInstallation(b.id, adminCtx.userId);
    const issued = await issueChatLinkProof(admin, inst.id, "U-multi", "Morgan Slack");
    await runCommand("consume_chat_link_proof", { proof: issued.proof }, member);

    const links = await adminCtx.db.rpc("list_chat_user_links", { p_brewery: b.id });
    expect(links.error).toBeNull();
    expect(links.data).toEqual([expect.objectContaining({ id: issued.linkId, roles: ["sales", "warehouse"] })]);
    const deniedList = await outsider.db.rpc("list_chat_user_links", { p_brewery: b.id });
    expect(deniedList.error?.code).toBe("42501");
    const deniedUnlink = await outsider.db.rpc("unlink_chat_user", {
      p_brewery: b.id, p_link: issued.linkId, p_request_id: crypto.randomUUID(),
    });
    expect(deniedUnlink.error?.code).toBe("42501");
    expect((await linkRow(issued.linkId)).state).toBe("active");

    await runCommand("unlink_chat_user", { linkId: issued.linkId }, adminCtx);
    expect((await linkRow(issued.linkId)).state).toBe("unlinked");
  });
});
