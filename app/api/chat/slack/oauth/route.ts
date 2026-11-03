// app/api/chat/slack/oauth/route.ts — Slack OAuth callback. Validates the hashed
// intent before any token exchange, lets Chat SDK store the token in private
// state, activates the MGR mapping, and lands on /settings/chat. Errors carry a
// short code only; code/state/tokens are never logged.
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { completeSlackInstall, slackAppOrigin, slackRedirectUri } from "@/lib/chat/oauth";
import { slackOAuthPort } from "@/lib/chat/slack-adapter";
import { integrationFailureCause } from "@/lib/integration-failure";

export async function GET(request: Request) {
  let base: string;
  try {
    base = slackAppOrigin();
  } catch (error) {
    console.error("slack_oauth_callback_failed", integrationFailureCause(error, "oauth_config"));
    return new Response("APP_URL is not configured", { status: 500 });
  }
  let stage = "oauth_session";
  try {
    const db = await createServerClient();
    stage = "oauth_config";
    const port = slackOAuthPort();
    const redirectUri = slackRedirectUri();
    stage = "oauth_complete";
    await completeSlackInstall(db, request, port, redirectUri);
    return NextResponse.redirect(`${base}/settings/chat?installed=1`, 303);
  } catch (error) {
    console.error("slack_oauth_callback_failed", integrationFailureCause(error, stage));
    return NextResponse.redirect(`${base}/settings/chat?error=oauth_failed`, 303);
  }
}
