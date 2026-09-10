import { isUuid } from "@/lib/commands/context";
import { getPublishedMenu } from "@/lib/supabase/public-menu";

const publicHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
};

const missing = () => Response.json({ error: "menu not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(_request: Request, context: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await context.params;
  if (!isUuid(publicId)) return missing();

  let data;
  try {
    data = await getPublishedMenu(publicId);
  } catch (error) {
    console.error("public menu read failed:", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "menu unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!data) return missing();
  return Response.json(data, { headers: publicHeaders });
}
