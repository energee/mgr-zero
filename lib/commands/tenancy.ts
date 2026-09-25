import { z } from "zod";
import { CommandError, definePreTenantCommand } from "./registry";

// Brewery creation is refused on a dedicated deployment (MGR_DEDICATED=1) for
// every caller, web page and API alike (#467). The database cannot read that
// variable, so this check is the gate, and the RPC is service-role only.
// Server-only modules load lazily so the registry stays importable by scripts.
definePreTenantCommand({
  name: "provision_brewery",
  description: "Create a brewery and join it as its first admin.",
  input: z.object({ name: z.string().trim().min(1), timezone: z.string().min(1), ttb: z.string().trim().nullable().optional() }),
  handler: async (ctx, input, execution) => {
    if ((await import("@/lib/env/server")).getServerEnv().dedicated) {
      throw new CommandError("Brewery creation is disabled on this deployment", 403, "permission_denied");
    }
    return (await import("@/lib/supabase/provision")).provisionBrewery(ctx, input, execution);
  },
});
