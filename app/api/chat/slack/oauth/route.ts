// app/api/chat/slack/oauth/route.ts — Slack OAuth callback. Validates the hashed
// intent before any token exchange, lets Chat SDK store the token in private
// state, activates the MGR mapping, and lands on /settings/chat. Errors carry a
// short code only; code/state/tokens are never logged.
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { completeSlackInstall } from "@/lib/chat/oauth";
import { slackOAuthPort } from "@/lib/chat/slack-adapter";
import { slackAppOrigin, slackRedirectUri } from "../install/route";

export async function GET(request: Request) {
  let base: string;
  try {
    base = slackAppOrigin();
  } catch {
    return new Response("APP_URL is not configured", { status: 500 });
  }
  try {
    const db = await createServerClient();
    await completeSlackInstall(db, request, slackOAuthPort(), slackRedirectUri());
    return NextResponse.redirect(`${base}/settings/chat?installed=1`, 303);
  } catch {
    return NextResponse.redirect(`${base}/settings/chat?error=oauth_failed`, 303);
  }
}
