import { createHash } from "node:crypto";
import { isUuid } from "@/lib/commands/context";
import { getPublishedMenu } from "@/lib/supabase/public-menu";

const publicHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
};

const missing = () => Response.json({ error: "menu not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
const matches = (value: string | null, etag: string) => value?.split(",").some((candidate) => {
  const tag = candidate.trim();
  return tag === "*" || tag === etag || tag === `W/${etag}`;
}) ?? false;

export async function GET(request: Request, context: { params: Promise<{ publicId: string }> }) {
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
  const version = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  const etag = `"${version}"`;
  const headers = { ...publicHeaders, ETag: etag };
  if (matches(request.headers.get("If-None-Match"), etag)) return new Response(null, { status: 304, headers });
  return Response.json({ ...(data as Record<string, unknown>), version }, { headers });
}
