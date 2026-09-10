import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { completeQboOAuth, qboConfig, QboOAuthClient } from "@/lib/qbo";
import { claimQboOAuth, completeQboOAuthStore, failQboOAuth } from "@/lib/supabase/integration-tokens";

export async function GET(request: Request) {
  const destination = new URL("/settings/accounting", request.url);
  try {
    const config = qboConfig();
    const db = await createServerClient();
    const { data } = await db.auth.getClaims();
    const actorId = data?.claims.sub;
    const breweryId = (await cookies()).get("brewery")?.value;
    if (typeof actorId !== "string" || !breweryId) throw new Error("oauth state invalid");
    await completeQboOAuth({
      request, actorId, selectedBreweryId: breweryId, redirectUri: config.redirectUri,
      client: new QboOAuthClient(config),
      store: { claim: claimQboOAuth, complete: completeQboOAuthStore, fail: failQboOAuth },
    });
    destination.searchParams.set("connected", "1");
  } catch {
    destination.searchParams.set("error", "oauth");
  }
  return NextResponse.redirect(destination, 303);
}
