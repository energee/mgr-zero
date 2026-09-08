import { z } from "zod";
import { definePreTenantCommand, unwrap } from "./registry";

definePreTenantCommand({
  name: "provision_brewery",
  description: "Create a brewery and join it as its first admin.",
  input: z.object({ name: z.string().trim().min(1), timezone: z.string().min(1), ttb: z.string().trim().nullable().optional() }),
  handler: async (ctx, input, execution) => unwrap(ctx.db.rpc("provision_brewery", {
    p_name: input.name, p_timezone: input.timezone, p_ttb: input.ttb || null, p_request_id: execution.requestId,
  })),
});
