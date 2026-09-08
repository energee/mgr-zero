// app/api/chat/slack/oauth/route.ts — Slack OAuth callback. Validates the hashed
// intent before any token exchange, lets Chat SDK store the token in private
// state, activates the MGR mapping, and lands on /settings/chat. Errors carry a
// short code only; code/state/tokens are never logged.
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { completeSlackInstall } from "@/lib/chat/oauth";
import { slackOAuthPort } from "@/lib/chat/slack-adapter";
import { slackRedirectUri } from "../install/route";

export async function GET(request: Request) {
  const base = process.env.APP_URL ?? new URL(request.url).origin;
  try {
    const db = await createServerClient();
    await completeSlackInstall(db, request, slackOAuthPort(), slackRedirectUri(request));
    return NextResponse.redirect(`${base}/settings/chat?installed=1`, 303);
  } catch {
    return NextResponse.redirect(`${base}/settings/chat?error=oauth_failed`, 303);
  }
}
