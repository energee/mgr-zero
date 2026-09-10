import { createClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/commands/context";
import { publicEnv } from "@/lib/env/public";

const publicHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
};

const missing = () => Response.json({ error: "menu not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(_request: Request, context: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await context.params;
  if (!isUuid(publicId)) return missing();

  const db = createClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await db.rpc("get_published_pos_menu", { p_public_id: publicId });
  if (error) {
    console.error("public menu read failed:", error.code ?? "unknown");
    return Response.json({ error: "menu unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!data) return missing();
  return Response.json(data, { headers: publicHeaders });
}
