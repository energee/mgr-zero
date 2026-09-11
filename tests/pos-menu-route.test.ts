// Public menu feed: narrow fields, explicit publication, derived availability,
// and a documented short shared-cache window.
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { GET, OPTIONS } from "@/app/api/public/menus/[publicId]/route";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { admin, channelId, makeBrewery, makeStaffCtx, priceSku, seedCatalog, seedLocation } from "./helpers";

const execution = () => ({ requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });

describe("GET /api/public/menus/[publicId]", () => {
  it("returns only explicitly published current safe rows without opening menu tables", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const location = await seedLocation(brewery.id, { name: "Public Taproom", kind: "taproom" });
    const connection = await admin.from("pos_connections").insert({
      brewery_id: brewery.id, merchant_id: `private-${crypto.randomUUID()}`, state: "connected", credential_version: 1,
    }).select("id").single();
    expect(connection.error).toBeNull();
    expect((await admin.from("pos_locations").insert({
      brewery_id: brewery.id, connection_id: connection.data!.id, external_location_id: "PRIVATE-SQUARE-ID",
      external_name: "Private provider label", external_status: "ACTIVE", location_id: location.id,
    })).error).toBeNull();
    const channel = await channelId(brewery.id, "Taproom");
    const keg = await seedCatalog(brewery.id, { product: "Website Hazy", sku: "Private keg label", packageType: "keg", bblPerUnit: 0.5, format: "Half bbl" });
    const formats = await admin.from("formats").insert([
      { brewery_id: brewery.id, brand_id: keg.brandId, name: "Pint", basis: "poured", ounces: 16 },
      { brewery_id: brewery.id, brand_id: keg.brandId, name: "Half pint", basis: "poured", ounces: 8 },
    ]).select("id,name");
    expect(formats.error).toBeNull();
    const pintId = formats.data!.find((row) => row.name === "Pint")!.id;
    const halfPintId = formats.data!.find((row) => row.name === "Half pint")!.id;
    await priceSku(brewery.id, { saleChannelId: channel, brandId: keg.brandId, formatId: pintId, cents: 700 });
    await priceSku(brewery.id, { saleChannelId: channel, brandId: keg.brandId, formatId: halfPintId, cents: 400 });
    await runCommand("record_movement", {
      skuId: keg.skuId, locationId: location.id, binId: location.binId, qty: 1, type: "opening_balance",
    }, ctx, execution());
    const configured = await runCommand("configure_pos_menu", {
      posLocationId: "PRIVATE-SQUARE-ID", binId: location.binId, saleChannelId: channel,
    }, ctx, execution()) as { publicId: string };
    await runCommand("set_pos_website_publication", {
      posLocationId: "PRIVATE-SQUARE-ID", formatId: pintId, published: true,
    }, ctx, execution());

    const response = await GET(new Request(`http://localhost/api/public/menus/${configured.publicId}`), {
      params: Promise.resolve({ publicId: configured.publicId }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Expose-Headers")).toBe("ETag");
    const body = await response.json();
    expect(body).toMatchObject({
      location: "Public Taproom",
      version: expect.stringMatching(/^[a-f0-9]{64}$/),
      items: [{ brand: "Website Hazy", format: "Pint", ounces: 16, priceCents: 700, available: true }],
    });
    const etag = response.headers.get("ETag");
    expect(etag).toBe(`"${body.version}"`);
    expect(Object.keys(body.items[0]).sort()).toEqual(["available", "brand", "format", "ounces", "priceCents"]);
    expect(JSON.stringify(body)).not.toMatch(new RegExp([
      brewery.id, configured.publicId, connection.data!.id, location.id, location.binId, channel,
      keg.skuId, pintId, halfPintId, "PRIVATE-SQUARE-ID", "Private provider label", "Private keg label",
    ].join("|"), "i"));

    const repeated = await GET(new Request(`http://localhost/api/public/menus/${configured.publicId}`), {
      params: Promise.resolve({ publicId: configured.publicId }),
    });
    expect(await repeated.json()).toEqual(body);
    expect(repeated.headers.get("ETag")).toBe(etag);

    const unchanged = await GET(new Request(`http://localhost/api/public/menus/${configured.publicId}`, {
      headers: { "If-None-Match": etag! },
    }), { params: Promise.resolve({ publicId: configured.publicId }) });
    expect(unchanged.status).toBe(304);
    expect(await unchanged.text()).toBe("");
    expect(unchanged.headers.get("ETag")).toBe(etag);
    expect(unchanged.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    expect(unchanged.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(unchanged.headers.get("Access-Control-Expose-Headers")).toBe("ETag");

    await runCommand("set_pos_price_override", {
      posLocationId: "PRIVATE-SQUARE-ID", formatId: pintId, unitPriceCents: 650,
    }, ctx, execution());
    const changed = await GET(new Request(`http://localhost/api/public/menus/${configured.publicId}`, {
      headers: { "If-None-Match": etag! },
    }), { params: Promise.resolve({ publicId: configured.publicId }) });
    expect(changed.status).toBe(200);
    expect(changed.headers.get("ETag")).not.toBe(etag);
    const changedBody = await changed.json();
    expect(changedBody).toMatchObject({ items: [{ priceCents: 650 }] });
    expect(changedBody.version).not.toBe(body.version);

    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false },
    });
    expect((await anon.from("pos_menus").select("*")).error?.code).toBe("42501");
    expect((await anon.from("pos_menu_lines").select("*")).error?.code).toBe("42501");
    expect((await anon.rpc("get_published_pos_menu", { p_public_id: configured.publicId })).error?.code).toBe("42501");

    await runCommand("set_pos_website_publication", {
      posLocationId: "PRIVATE-SQUARE-ID", formatId: pintId, published: false,
    }, ctx, execution());
    const unpublished = await GET(new Request(`http://localhost/api/public/menus/${configured.publicId}`), {
      params: Promise.resolve({ publicId: configured.publicId }),
    });
    expect(await unpublished.json()).toMatchObject({ items: [] });

    const missing = await GET(new Request("http://localhost/api/public/menus/not-a-uuid"), {
      params: Promise.resolve({ publicId: "not-a-uuid" }),
    });
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Cache-Control")).toBe("no-store");
    expect(missing.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await missing.json()).toEqual({ error: "menu not found" });

    const preflight = await OPTIONS(new Request(`http://localhost/api/public/menus/${configured.publicId}`, {
      method: "OPTIONS",
      headers: { Origin: "https://brewery.example", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "If-None-Match" },
    }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(preflight.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toBe("If-None-Match");
  });
});
