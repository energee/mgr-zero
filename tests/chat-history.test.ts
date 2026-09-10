import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { makeBrewery, makeStaffCtx, seedCatalog, seedLocation, sql } from "./helpers";

describe("scoped composer history and provenance", () => {
  let breweryId: string;
  let otherBreweryId: string;
  let owner: Ctx;
  let foreignAuthor: Ctx;
  let foreignTenant: Ctx;
  let catalog: Awaited<ReturnType<typeof seedCatalog>>;
  let location: Awaited<ReturnType<typeof seedLocation>>;

  beforeAll(async () => {
    breweryId = (await makeBrewery()).id;
    otherBreweryId = (await makeBrewery()).id;
    owner = await makeStaffCtx(breweryId, "admin");
    foreignAuthor = await makeStaffCtx(breweryId, "admin");
    foreignTenant = await makeStaffCtx(otherBreweryId, "admin");
    catalog = await seedCatalog(breweryId);
    location = await seedLocation(breweryId);
  });

  it("keeps conversations private to their author and tenant and deduplicates message retries", async () => {
    const conversation = await runCommand("create_chat_conversation", { title: "Inventory" }, owner, {
      requestId: randomUUID(), correlationId: randomUUID(), origin: "ui",
    }) as { id: string };
    const requestId = randomUUID();
    const execution = { requestId, correlationId: randomUUID(), origin: "ui" as const };
    const input = { conversationId: conversation.id, role: "user", content: "Remove one case" };
    const first = await runCommand("append_chat_message", input, owner, execution);
    await expect(runCommand("append_chat_message", input, owner, execution)).resolves.toEqual(first);
    await expect(runCommand("get_chat_history", { conversationId: conversation.id }, owner)).resolves.toMatchObject({
      conversation: { id: conversation.id, title: "Inventory" },
      messages: [{ role: "user", content: "Remove one case" }],
    });
    await expect(runCommand("get_chat_history", { conversationId: conversation.id }, foreignAuthor)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(runCommand("get_chat_history", { conversationId: conversation.id }, foreignTenant)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(runCommand("append_chat_message", {
      conversationId: conversation.id, role: "user", content: "Wrong author",
    }, foreignAuthor)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(runCommand("append_chat_message", {
      conversationId: conversation.id, role: "user", content: "Wrong brewery",
    }, foreignTenant)).rejects.toMatchObject({ code: "permission_denied" });
    expect(sql(`select count(*) from private.chat_messages where conversation_id='${conversation.id}'`)).toEqual(["1"]);
  });

  it("denies application roles direct access to preview and history tables", async () => {
    for (const table of ["command_previews", "chat_conversations", "chat_messages"]) {
      const result = await owner.db.schema("private").from(table).select("*");
      expect(result.error, table).not.toBeNull();
    }
  });

  it("refuses chat-origin movement without a bound preview while ordinary form movement still works", async () => {
    const ordinary = await runCommand("record_movement", {
      skuId: catalog.skuId, locationId: location.id, binId: location.binId, qty: 2, type: "opening_balance",
    }, owner) as { id: string };
    expect(ordinary.id).toMatch(/^[0-9a-f-]{36}$/);

    const conversation = await runCommand("create_chat_conversation", {}, owner) as { id: string };
    const attempted = await owner.db.rpc("record_inventory_movement", {
      p_brewery: breweryId, p_sku: catalog.skuId, p_location: location.id, p_bin: location.binId,
      p_qty: 1, p_type: "adjustment", p_sale_channel: null, p_dest_state: null, p_note: null,
      p_request_id: randomUUID(), p_lot: null, p_origin: "chat", p_conversation: conversation.id,
      p_preview_token: null,
    });
    expect(attempted.error?.message).toMatch(/preview token required/i);
    expect(sql(`select count(*) from public.inventory_movements where brewery_id='${breweryId}'`)).toEqual(["1"]);
  });

  it("binds confirmation to its author, conversation, and canonical input and records one replay-safe result", async () => {
    const conversation = await runCommand("create_chat_conversation", {}, owner) as { id: string };
    const otherConversation = await runCommand("create_chat_conversation", {}, owner) as { id: string };
    const input = {
      skuId: catalog.skuId, locationId: location.id, binId: location.binId, qty: 3, type: "adjustment" as const,
    };
    const proposal = await runCommand("preview_command", {
      name: "record_movement", input, conversationId: conversation.id,
    }, owner) as { preview: { previewToken: string } };

    const wrongConversation = {
      requestId: randomUUID(), correlationId: randomUUID(), origin: "chat" as const,
      conversationId: otherConversation.id, previewToken: proposal.preview.previewToken,
    };
    await expect(runCommand("record_movement", input, owner, wrongConversation)).rejects.toMatchObject({
      message: expect.stringMatching(/invalid preview token/i),
    });

    const requestId = randomUUID();
    const execution = {
      requestId, correlationId: randomUUID(), origin: "chat" as const,
      conversationId: conversation.id, previewToken: proposal.preview.previewToken,
    };
    const first = await runCommand("record_movement", input, owner, execution) as { id: string };
    await expect(runCommand("record_movement", input, owner, execution)).resolves.toEqual(first);
    const history = await runCommand("get_chat_history", { conversationId: conversation.id }, owner) as {
      messages: { role: string; request_id: string | null; result: unknown }[];
    };
    expect(history.messages).toEqual([
      expect.objectContaining({ role: "result", request_id: requestId, result: first }),
    ]);
    expect(sql(`select count(*) from public.inventory_movements where id='${first.id}'`)).toEqual(["1"]);
  });
});
