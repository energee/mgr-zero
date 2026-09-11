import { z } from "zod";
import { CommandError, defineCommand, defineQuery, unwrap } from "./registry";

async function completePosRows<T>(page: (start: number) => PromiseLike<{
  data: unknown[] | null; error: { message: string; code?: string } | null; count: number | null;
}>): Promise<T[]> {
  const all: T[] = [];
  let total: number | undefined;
  do {
    const result = await page(all.length);
    const next = await unwrap(Promise.resolve(result));
    if (result.count === null || !next || (total !== undefined && result.count !== total)
      || (next.length === 0 && all.length < result.count)) {
      throw new CommandError("The complete Square mapping list could not be loaded. Retry the read.", 409, "conflict");
    }
    total = result.count;
    all.push(...next as T[]);
  } while (all.length < total);
  return all;
}

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

defineCommand({
  name: "sync_square_sales", description: "Resume a bounded Square UPDATED_AT scan, append immutable sale and return revisions, and complete honest coverage without changing inventory",
  input: z.object({}), roles: ["admin"],
  handler: async (ctx, _input, execution) => {
    const { squareConfig, SquareClient, syncSquareSales } = await import("@/lib/pos");
    return syncSquareSales(ctx, execution.requestId, new SquareClient(squareConfig()));
  },
});

defineQuery({
  name: "list_pos_locations", description: "List every observed Square location and its explicit labeled MGR location mapping",
  input: z.object({}), roles: ["admin"],
  handler: async (ctx) => {
    const data = await completePosRows<{ external_location_id: string; external_name: string | null; external_status: string | null;
      available: boolean; location_id: string | null; locations: { name: string } | null }>((start) =>
      ctx.db.from("pos_locations").select("external_location_id,external_name,external_status,available,location_id,locations(name)", { count: "exact" })
        .eq("brewery_id", ctx.breweryId).order("external_location_id").range(start, start + 499),
    );
    return data.map((row) => ({ externalLocationId: row.external_location_id, name: row.external_name,
      status: row.external_status, available: row.available, mgrLocationId: row.location_id,
      mappingLabel: row.locations?.name ?? null }));
  },
});

defineQuery({
  name: "list_pos_variations", description: "List every observed Square variation with queued, ignored, or explicit labeled packaged/poured mapping state",
  input: z.object({}), roles: ["admin", "warehouse"],
  handler: async (ctx) => {
    const [data, mappings] = await Promise.all([
      completePosRows<{ external_item_id: string; external_variation_id: string; external_item_name: string | null;
        external_variation_name: string | null; available: boolean }>((start) =>
        ctx.db.from("pos_catalog_variations").select("external_item_id,external_variation_id,external_item_name,external_variation_name,available", { count: "exact" })
          .eq("brewery_id", ctx.breweryId).order("external_item_id").order("external_variation_id").range(start, start + 499),
      ),
      completePosRows<{ external_item_id: string; external_variation_id: string; sku_id: string | null; format_id: string | null;
        ignored: boolean; skus: { name: string } | null; formats: { name: string } | null }>((start) =>
        ctx.db.from("pos_item_mappings").select("external_item_id,external_variation_id,sku_id,format_id,ignored,skus(name),formats(name)", { count: "exact" })
          .eq("brewery_id", ctx.breweryId).order("external_item_id").order("external_variation_id").range(start, start + 499),
      ),
    ]);
    const byVariation = new Map(mappings.map((row) => [`${row.external_item_id}\0${row.external_variation_id}`, row]));
    return data.map((row) => {
      const mapping = byVariation.get(`${row.external_item_id}\0${row.external_variation_id}`);
      return { externalItemId: row.external_item_id, externalVariationId: row.external_variation_id,
        itemName: row.external_item_name, variationName: row.external_variation_name, available: row.available,
        disposition: mapping?.ignored ? "ignored" : mapping ? "mapped" : "queued", skuId: mapping?.sku_id ?? null, formatId: mapping?.format_id ?? null,
        mappingLabel: mapping?.ignored ? "Ignored" : mapping?.sku_id && mapping.skus ? `SKU · ${mapping.skus.name}`
          : mapping?.format_id && mapping.formats ? `Pour · ${mapping.formats.name}` : null };
    });
  },
});

defineCommand({
  name: "set_pos_location_mapping", description: "Map one observed Square location to one unclaimed MGR location; a pre-history remap clears its menu, and observed history prevents remapping",
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

const posLocationId = z.string().trim().min(1).max(200);
const menuRoles = ["admin", "warehouse"] as const;

defineCommand({
  name: "configure_pos_menu", description: "Choose the mapped MGR bin and sale channel that derive one Square location's menu",
  input: z.object({ posLocationId, binId: z.string().uuid(), saleChannelId: z.string().uuid() }),
  roles: [...menuRoles],
  handler: (ctx, input, execution) => unwrap(ctx.db.rpc("configure_pos_menu", {
    p_brewery: ctx.breweryId, p_external_location: input.posLocationId, p_bin: input.binId,
    p_sale_channel: input.saleChannelId, p_request_id: execution.requestId,
  })),
});

defineQuery({
  name: "get_pos_menu", description: "Read one complete Square-location menu derived from its configured bin, active keg stock, poured formats, and channel prices",
  input: z.object({ posLocationId }), roles: [...menuRoles],
  handler: (ctx, input) => unwrap(ctx.db.rpc("get_pos_menu", {
    p_brewery: ctx.breweryId, p_external_location: input.posLocationId,
  })),
});

defineQuery({
  name: "get_pos_menu_item", description: "Read one derived poured-format menu item and its location-specific price source",
  input: z.object({ posLocationId, formatId: z.string().uuid() }), roles: [...menuRoles],
  handler: (ctx, input) => unwrap(ctx.db.rpc("get_pos_menu_item", {
    p_brewery: ctx.breweryId, p_external_location: input.posLocationId, p_format: input.formatId,
  })),
});

defineCommand({
  name: "set_pos_price_override", description: "Set or clear one nullable poured-format price override for one Square location",
  input: z.object({
    posLocationId, formatId: z.string().uuid(),
    unitPriceCents: z.number().int().min(0).max(2_147_483_647).nullable(),
  }),
  roles: [...menuRoles],
  handler: (ctx, input, execution) => unwrap(ctx.db.rpc("set_pos_price_override", {
    p_brewery: ctx.breweryId, p_external_location: input.posLocationId, p_format: input.formatId,
    p_unit_price_cents: input.unitPriceCents, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "set_pos_website_publication", description: "Publish or unpublish one currently priced, stocked menu row on the brewery website feed",
  input: z.object({ posLocationId, formatId: z.string().uuid(), published: z.boolean() }),
  roles: [...menuRoles],
  handler: (ctx, input, execution) => unwrap(ctx.db.rpc("set_pos_website_publication", {
    p_brewery: ctx.breweryId, p_external_location: input.posLocationId, p_format: input.formatId,
    p_published: input.published, p_request_id: execution.requestId,
  })),
});
