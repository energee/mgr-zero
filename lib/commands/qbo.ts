import { z } from "zod";
import { defineCommand, defineQuery, unwrap } from "./registry";

defineCommand({
  name: "connect_qbo", description: "Begin administrator consent for a QuickBooks connection",
  input: z.object({ reconnect: z.boolean().optional() }), roles: ["admin"],
  handler: async (ctx, input, execution) => {
    const { beginQboOAuth, qboConfig, QboOAuthClient } = await import("@/lib/qbo");
    return beginQboOAuth(ctx, new QboOAuthClient(qboConfig()), input.reconnect ? "reconnect" : "connect", execution.requestId);
  },
});

defineCommand({
  name: "disconnect_qbo", description: "Disable QuickBooks locally, release its company ownership, purge its credential, and attempt remote revocation; the exact requestId replays the recorded outcome",
  input: z.object({ connectionId: z.string().uuid() }), roles: ["admin"],
  handler: async (ctx, input, execution) => {
    const [{ disconnectQbo }, { qboConfig, QboOAuthClient }] = await Promise.all([
      import("@/lib/supabase/integration-tokens"), import("@/lib/qbo"),
    ]);
    const client = new QboOAuthClient(qboConfig());
    return disconnectQbo(ctx, input.connectionId, (token) => client.revoke(token), execution.requestId);
  },
});

defineQuery({
  name: "get_qbo_connection", description: "Get redacted QuickBooks connection health and the connectionId required to disconnect",
  input: z.object({}), roles: ["admin"],
  handler: async (ctx) => (await import("@/lib/supabase/integration-tokens")).getQboHealth(ctx),
});

defineCommand({
  name: "set_qbo_customer_mapping", description: "Bind a customer to a QuickBooks customer in the current company",
  input: z.object({ customerId: z.string().uuid(), qboCustomerId: z.string().trim().min(1) }), roles: ["admin", "sales"],
  handler: (ctx, input, execution) => unwrap(ctx.db.rpc("set_qbo_customer_mapping", {
    p_brewery: ctx.breweryId, p_customer: input.customerId, p_qbo_customer_id: input.qboCustomerId, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "set_qbo_item_mapping", description: "Bind a SKU to a QuickBooks item in the current company",
  input: z.object({ skuId: z.string().uuid(), qboItemId: z.string().trim().min(1) }), roles: ["admin", "sales"],
  handler: (ctx, input, execution) => unwrap(ctx.db.rpc("set_qbo_item_mapping", {
    p_brewery: ctx.breweryId, p_sku: input.skuId, p_qbo_item_id: input.qboItemId, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "set_qbo_deposit_mapping", description: "Set the QuickBooks item used for returnable-keg deposit charges",
  input: z.object({ qboItemId: z.string().trim().min(1) }), roles: ["admin"],
  handler: (ctx, input, execution) => unwrap(ctx.db.rpc("set_qbo_deposit_mapping", {
    p_brewery: ctx.breweryId, p_qbo_item_id: input.qboItemId, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "set_qbo_push_defaults", description: "Set the ACH and card options copied onto future QuickBooks invoices",
  input: z.object({ allowAch: z.boolean(), allowCard: z.boolean() }), roles: ["admin"],
  handler: (ctx, input, execution) => unwrap(ctx.db.rpc("set_qbo_push_defaults", {
    p_brewery: ctx.breweryId, p_allow_ach: input.allowAch, p_allow_card: input.allowCard,
    p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "push_invoice_to_qbo", description: "Push a frozen local invoice or credit memo to the current QuickBooks company with a durable request ID",
  input: z.object({
    invoiceId: z.string().uuid(),
    newAttemptReason: z.enum(["corrected", "remote_deleted"]).optional(),
  }),
  roles: ["admin", "sales"], requiresConfirmation: true,
  handler: async (ctx, input, execution) => {
    const { pushInvoiceToQbo, qboConfig, QboOAuthClient } = await import("@/lib/qbo");
    return pushInvoiceToQbo(ctx, input.invoiceId, execution.requestId, new QboOAuthClient(qboConfig()), input.newAttemptReason);
  },
});

defineCommand({
  name: "sync_qbo_payments", description: "Read current QuickBooks invoice balances, payment evidence, edits, voids, and deletions",
  input: z.object({}), roles: ["admin", "sales"],
  handler: async (ctx, _input, execution) => {
    const { qboConfig, QboOAuthClient, syncQboInvoices } = await import("@/lib/qbo");
    return syncQboInvoices(ctx, execution.requestId, new QboOAuthClient(qboConfig()));
  },
});

defineCommand({
  name: "write_off_invoice", description: "Mark a QuickBooks-voided or deleted invoice written off in MGR without recording cash or changing QuickBooks",
  input: z.object({ invoiceId: z.string().uuid(), reason: z.string().trim().min(1).max(500) }),
  roles: ["admin"], requiresConfirmation: true,
  handler: (ctx, input, execution) => unwrap(ctx.db.rpc("write_off_invoice", {
    p_brewery: ctx.breweryId, p_invoice: input.invoiceId, p_reason: input.reason,
    p_request_id: execution.requestId,
  })),
});
