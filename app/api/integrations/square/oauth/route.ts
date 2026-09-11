import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getActiveBrewery } from "@/lib/brewery";
import { completeSquareOAuth, squareConfig, SquareClient } from "@/lib/pos";
import { createServerClient } from "@/lib/supabase/server";
import { claimSquareOAuth, completeSquareOAuthStore, failSquareOAuth } from "@/lib/supabase/integration-tokens";

export async function GET(request: Request) {
  const destination = new URL("/settings/pos", request.url);
  try {
    const config = squareConfig();
    const db = await createServerClient();
    const { data } = await db.auth.getClaims();
    const actorId = data?.claims.sub;
    const picked = (await cookies()).get("brewery")?.value;
    const activeBrewery = await getActiveBrewery();
    if (typeof actorId !== "string" || activeBrewery.role !== "admin" || (picked && picked !== activeBrewery.id)) {
      throw new Error("oauth state invalid");
    }
    await completeSquareOAuth({
      request, actorId, selectedBreweryId: activeBrewery.id, redirectUri: config.redirectUri,
      client: new SquareClient(config),
      store: { claim: claimSquareOAuth, complete: completeSquareOAuthStore, fail: failSquareOAuth },
    });
    destination.searchParams.set("connected", "1");
  } catch {
    destination.searchParams.set("error", "oauth");
  }
  return NextResponse.redirect(destination, 303);
}
