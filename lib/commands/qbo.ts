import { z } from "zod";
import { defineCommand, defineQuery } from "./registry";

defineCommand({
  name: "connect_qbo", description: "Begin administrator consent for a QuickBooks connection",
  input: z.object({ reconnect: z.boolean().optional() }), roles: ["admin"],
  handler: async (ctx, input, execution) => {
    const { beginQboOAuth, qboConfig, QboOAuthClient } = await import("@/lib/qbo");
    return beginQboOAuth(ctx, new QboOAuthClient(qboConfig()), input.reconnect ? "reconnect" : "connect", execution.requestId);
  },
});

defineCommand({
  name: "disconnect_qbo", description: "Disable QuickBooks locally, purge its credential, and attempt remote revocation; the exact requestId replays the recorded outcome",
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
