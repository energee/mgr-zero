// lib/supabase/integration-tokens.ts — the only server boundary for private integration credentials.
import { CommandError, type Ctx } from "@/lib/commands/registry";
import { createAdminClient } from "@/lib/supabase/admin";

export type IntegrationProvider = "qbo" | "square";

type TokenInput = {
  provider: IntegrationProvider;
  accessToken: string;
  refreshToken: string;
};

type IntegrationTokens = {
  accessToken: string;
  refreshToken: string;
};

function requireIntegrationRole(ctx: Ctx) {
  if (ctx.role !== "admin" && ctx.role !== "sales") {
    throw new CommandError("integration access requires admin or sales", 403);
  }
}

async function requireVisibleConnection(ctx: Ctx, provider: IntegrationProvider) {
  const query = provider === "qbo"
    ? ctx.db.from("qbo_connections").select("brewery_id").eq("brewery_id", ctx.breweryId).maybeSingle()
    : ctx.db.from("pos_connections").select("brewery_id").eq("brewery_id", ctx.breweryId).eq("provider", provider).maybeSingle();
  const { data, error } = await query;
  if (error || !data) {
    throw new CommandError("integration connection is not available for this brewery", 403);
  }
}

async function authorizeTokenAccess(ctx: Ctx, provider: IntegrationProvider) {
  requireIntegrationRole(ctx);
  await requireVisibleConnection(ctx, provider);
}

export async function storeIntegrationTokens(ctx: Ctx, input: TokenInput): Promise<void> {
  if (!input.accessToken || !input.refreshToken) {
    throw new CommandError("integration tokens are required");
  }
  await authorizeTokenAccess(ctx, input.provider);

  const { error } = await createAdminClient().rpc("store_integration_tokens", {
    p_brewery: ctx.breweryId,
    p_provider: input.provider,
    p_access_token: input.accessToken,
    p_refresh_token: input.refreshToken,
  });
  if (error) throw new Error("integration token storage failed");
}

export async function readIntegrationTokens(ctx: Ctx, provider: IntegrationProvider): Promise<IntegrationTokens> {
  await authorizeTokenAccess(ctx, provider);

  const { data, error } = await createAdminClient()
    .rpc("read_integration_tokens", { p_brewery: ctx.breweryId, p_provider: provider })
    .maybeSingle();
  if (error || !data) throw new CommandError("integration tokens are not available", 404);
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}
