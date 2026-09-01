// lib/commands/chat.ts — RLS-bound chat integration commands: staff linking
// (consume proof, unlink, link status). Settings/health operations arrive with
// the settings page task. Every write is one Postgres RPC.
import { z } from "zod";
import { defineCommand, defineQuery, unwrap, type StaffRole } from "./registry";
import { sha256 } from "@/lib/chat/linking";

const STAFF: StaffRole[] = ["admin", "sales", "warehouse", "brewer"];

defineCommand({
  name: "consume_chat_link_proof",
  description: "Complete a Slack → MGR account link using the single-use proof from App Home (current staff only)",
  input: z.object({ proof: z.string().min(1) }),
  roles: STAFF,
  handler: async (ctx, i) => {
    const r = await unwrap(ctx.db.rpc("consume_chat_link_proof", { p_proof_hash: sha256(i.proof) })) as
      { link_id: string; installation_id: string; brewery_id: string };
    return { linkId: r.link_id, installationId: r.installation_id, breweryId: r.brewery_id };
  },
});

defineCommand({
  name: "unlink_chat_user",
  description: "Unlink a Slack user from MGR (own link, or any link as admin); stops personal delivery",
  input: z.object({ linkId: z.string().uuid() }),
  roles: STAFF,
  handler: async (ctx, i) => { await unwrap(ctx.db.rpc("unlink_chat_user", { p_link: i.linkId })); return { ok: true }; },
});

defineQuery({
  name: "get_chat_link_status",
  description: "Whether the current user has an active Slack link for an installation",
  input: z.object({ installationId: z.string().uuid() }),
  roles: STAFF,
  handler: async (ctx, i) => {
    const link = await unwrap(
      ctx.db.from("chat_user_links").select("id, linked_at")
        .eq("installation_id", i.installationId).eq("user_id", ctx.userId).eq("state", "active").maybeSingle(),
    );
    return link ? { linked: true as const, linkId: link.id, linkedAt: link.linked_at } : { linked: false as const };
  },
});
