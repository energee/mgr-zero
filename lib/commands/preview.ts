import { z } from "zod";
import { defineCommand, defineQuery, previewCommand, STAFF_ROLES, unwrap } from "./registry";
import { movementInput } from "./inventory";

const conversationId = z.string().uuid();

defineQuery({
  name: "preview_command", description: "Canonicalize one supported command into server-owned effects and a bound preview token without running its write handler",
  input: z.object({ name: z.literal("record_movement"), input: movementInput, conversationId }), roles: STAFF_ROLES,
  handler: (ctx, input) => previewCommand(input.name, input.input, ctx, input.conversationId),
});

defineCommand({
  name: "create_chat_conversation", description: "Create one server-owned composer conversation for the current author and brewery",
  input: z.object({ title: z.string().trim().min(1).max(120).optional() }), roles: STAFF_ROLES,
  idempotency: "dedupe",
  handler: (ctx, input, execution) => unwrap(ctx.db.rpc("create_chat_conversation", {
    p_brewery: ctx.breweryId, p_title: input.title ?? null, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "append_chat_message", description: "Append one message to the current author's composer conversation",
  input: z.object({ conversationId, role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }), roles: STAFF_ROLES,
  idempotency: "dedupe",
  handler: (ctx, input, execution) => unwrap(ctx.db.rpc("append_chat_message", {
    p_brewery: ctx.breweryId, p_conversation: input.conversationId, p_role: input.role,
    p_content: input.content, p_request_id: execution.requestId,
  })),
});

defineQuery({
  name: "list_chat_conversations", description: "List the current author's composer conversations in this brewery",
  input: z.object({}), roles: STAFF_ROLES,
  handler: (ctx) => unwrap(ctx.db.rpc("list_chat_conversations", { p_brewery: ctx.breweryId })),
});

defineQuery({
  name: "get_chat_history", description: "Read one composer conversation and its messages for the current author and brewery",
  input: z.object({ conversationId }), roles: STAFF_ROLES,
  handler: (ctx, input) => unwrap(ctx.db.rpc("get_chat_history", {
    p_brewery: ctx.breweryId, p_conversation: input.conversationId,
  })),
});
