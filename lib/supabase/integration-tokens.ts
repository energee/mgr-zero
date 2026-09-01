// lib/supabase/integration-tokens.ts — the only server boundary for private integration credentials.
import "server-only";
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

type ConnectionRow = { id: string };
type TokenRow = { access_token: string; refresh_token: string };

function requireIntegrationRole(ctx: Ctx) {
  if (ctx.role !== "admin" && ctx.role !== "sales") {
    throw new CommandError("integration access requires admin or sales", 403);
  }
}

function isConnectionRow(data: unknown): data is ConnectionRow {
  return typeof data === "object" && data !== null && typeof (data as ConnectionRow).id === "string";
}

function isTokenRow(data: unknown): data is TokenRow {
  return typeof data === "object" && data !== null
    && typeof (data as TokenRow).access_token === "string"
    && typeof (data as TokenRow).refresh_token === "string";
}

async function requireVisibleConnection(ctx: Ctx, provider: IntegrationProvider): Promise<string> {
  const query = provider === "qbo"
    ? ctx.db.from("qbo_connections").select("id").eq("brewery_id", ctx.breweryId).maybeSingle()
    : ctx.db.from("pos_connections").select("id").eq("brewery_id", ctx.breweryId).eq("provider", provider).maybeSingle();
  const { data, error } = await query;
  if (error || !isConnectionRow(data)) {
    throw new CommandError("integration connection is not available for this brewery", 403);
  }
  return data.id;
}

async function authorizeTokenAccess(ctx: Ctx, provider: IntegrationProvider): Promise<string> {
  requireIntegrationRole(ctx);
  return requireVisibleConnection(ctx, provider);
}

export async function storeIntegrationTokens(ctx: Ctx, input: TokenInput): Promise<void> {
  if (!input.accessToken || !input.refreshToken) {
    throw new CommandError("integration tokens are required");
  }
  const connectionId = await authorizeTokenAccess(ctx, input.provider);

  const { data, error } = await createAdminClient().rpc("store_integration_tokens", {
    p_brewery: ctx.breweryId,
    p_provider: input.provider,
    p_connection: connectionId,
    p_actor: ctx.userId,
    p_access_token: input.accessToken,
    p_refresh_token: input.refreshToken,
  });
  if (error) throw new Error("integration token storage failed");
  if (data !== true) throw new CommandError("integration access is no longer available", 403);
}

export async function readIntegrationTokens(ctx: Ctx, provider: IntegrationProvider): Promise<IntegrationTokens> {
  const connectionId = await authorizeTokenAccess(ctx, provider);

  const { data, error } = await createAdminClient()
    .rpc("read_integration_tokens", {
      p_brewery: ctx.breweryId,
      p_provider: provider,
      p_connection: connectionId,
      p_actor: ctx.userId,
    })
    .maybeSingle();
  if (error || !isTokenRow(data)) throw new CommandError("integration tokens are not available", 404);
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}
