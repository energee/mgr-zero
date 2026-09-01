// app/api/chat/slack/oauth/route.ts — Slack OAuth callback. Validates the hashed
// intent before any token exchange, lets Chat SDK store the token in private
// state, activates the MGR mapping, and lands on /settings/chat. Errors carry a
// short code only; code/state/tokens are never logged.
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { CommandError } from "@/lib/commands/registry";
import { completeSlackInstall } from "@/lib/chat/oauth";
import { slackOAuthPort } from "@/lib/chat/slack-adapter";
import { slackRedirectUri } from "../install/route";

export async function GET(request: Request) {
  const base = process.env.APP_URL ?? new URL(request.url).origin;
  try {
    const db = await createServerClient();
    await completeSlackInstall(db, request, slackOAuthPort(), slackRedirectUri(request));
    return NextResponse.redirect(`${base}/settings/chat?installed=1`, 303);
  } catch (e) {
    const code = e instanceof CommandError ? e.message.replace(/\W+/g, "_") : "internal";
    if (!(e instanceof CommandError)) console.error("slack oauth callback failed:", e instanceof Error ? e.message : e);
    return NextResponse.redirect(`${base}/settings/chat?error=${encodeURIComponent(code)}`, 303);
  }
}
