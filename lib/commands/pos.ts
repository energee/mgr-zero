import { z } from "zod";
import { defineCommand, defineQuery, rows, unwrap } from "./registry";

defineCommand({
  name: "connect_square", description: "Begin administrator consent for a Square seller connection",
  input: z.object({ reconnect: z.boolean().optional() }), roles: ["admin"],
  handler: async (ctx, input, execution) => {
    const { beginSquareOAuth, squareConfig, SquareClient } = await import("@/lib/pos");
    return beginSquareOAuth(ctx, new SquareClient(squareConfig()), input.reconnect ? "reconnect" : "connect", execution.requestId);
  },
});

defineCommand({
  name: "disconnect_square", description: "Stop Square sync locally, purge its credential, and report whether remote revocation was confirmed",
  input: z.object({ connectionId: z.string().uuid() }), roles: ["admin"],
  handler: async (ctx, input, execution) => {
    const [{ disconnectSquare }, { squareConfig, SquareClient }] = await Promise.all([
      import("@/lib/supabase/integration-tokens"), import("@/lib/pos"),
    ]);
    const client = new SquareClient(squareConfig());
    return disconnectSquare(ctx, input.connectionId, (token) => client.revoke(token), execution.requestId);
  },
});

defineQuery({
  name: "get_pos_integration_health", description: "Get redacted Square seller connection health",
  input: z.object({}), roles: ["admin"],
  handler: async (ctx) => (await import("@/lib/supabase/integration-tokens")).getSquareHealth(ctx),
});

defineCommand({
  name: "sync_square_catalog", description: "Refresh the complete Square location and catalog-variation snapshot without changing inventory",
  input: z.object({}), roles: ["admin"],
  handler: async (ctx, _input, execution) => {
    const { squareConfig, SquareClient, syncSquareCatalog } = await import("@/lib/pos");
    return syncSquareCatalog(ctx, execution.requestId, new SquareClient(squareConfig()));
  },
});

defineQuery({
  name: "list_pos_locations", description: "List every observed Square location and its explicit MGR location mapping",
  input: z.object({}), roles: ["admin"],
  handler: async (ctx) => {
    const data = await rows<{ external_location_id: string; external_name: string | null; external_status: string | null; available: boolean; location_id: string | null }>(
      ctx.db.from("pos_locations").select("external_location_id,external_name,external_status,available,location_id")
        .eq("brewery_id", ctx.breweryId).order("external_name"),
    );
    return data.map((row) => ({ externalLocationId: row.external_location_id, name: row.external_name,
      status: row.external_status, available: row.available, mgrLocationId: row.location_id }));
  },
});

defineQuery({
  name: "list_pos_variations", description: "List observed Square variations with queued, ignored, or explicit packaged/poured mapping state",
  input: z.object({}), roles: ["admin", "warehouse"],
  handler: async (ctx) => {
    const [data, mappings] = await Promise.all([
      rows<{ external_item_id: string; external_variation_id: string; external_item_name: string | null; external_variation_name: string | null; available: boolean }>(
        ctx.db.from("pos_catalog_variations").select("external_item_id,external_variation_id,external_item_name,external_variation_name,available")
          .eq("brewery_id", ctx.breweryId).order("external_item_name"),
      ),
      rows<{ external_item_id: string; external_variation_id: string; sku_id: string | null; format_id: string | null; ignored: boolean }>(
        ctx.db.from("pos_item_mappings").select("external_item_id,external_variation_id,sku_id,format_id,ignored").eq("brewery_id", ctx.breweryId),
      ),
    ]);
    const byVariation = new Map(mappings.map((row) => [`${row.external_item_id}\0${row.external_variation_id}`, row]));
    return data.map((row) => {
      const mapping = byVariation.get(`${row.external_item_id}\0${row.external_variation_id}`);
      return { externalItemId: row.external_item_id, externalVariationId: row.external_variation_id,
        itemName: row.external_item_name, variationName: row.external_variation_name, available: row.available,
        disposition: mapping?.ignored ? "ignored" : mapping ? "mapped" : "queued", skuId: mapping?.sku_id ?? null, formatId: mapping?.format_id ?? null };
    });
  },
});

defineCommand({
  name: "set_pos_location_mapping", description: "Map one observed Square location to one unclaimed MGR location; observed history cannot be remapped in place",
  input: z.object({ posLocationId: z.string().trim().min(1), mgrLocationId: z.string().uuid() }), roles: ["admin"],
  handler: (ctx, input, execution) => unwrap(ctx.db.rpc("set_pos_location_mapping", {
    p_brewery: ctx.breweryId, p_external_location: input.posLocationId,
    p_location: input.mgrLocationId, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "set_pos_item_mapping", description: "Map one Square variation to a packaged SKU or brand-owned poured format, or explicitly ignore it",
  input: z.object({
    externalItemId: z.string().trim().min(1), externalVariationId: z.string().trim().min(1),
    skuId: z.string().uuid().optional(), formatId: z.string().uuid().optional(), disposition: z.enum(["mapped", "ignored"]),
  }).refine((value) => {
    const targets = Number(!!value.skuId) + Number(!!value.formatId);
    return (value.disposition === "mapped" && targets === 1) || (value.disposition === "ignored" && targets === 0);
  }, { message: "choose exactly one mapping target, or ignore the variation" }),
  roles: ["admin", "warehouse"],
  handler: (ctx, input, execution) => unwrap(ctx.db.rpc("set_pos_item_mapping", {
    p_brewery: ctx.breweryId, p_external_item: input.externalItemId, p_external_variation: input.externalVariationId,
    p_sku: input.skuId ?? null, p_format: input.formatId ?? null, p_ignored: input.disposition === "ignored", p_request_id: execution.requestId,
  })),
});
