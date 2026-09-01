// app/api/chat/slack/install/route.ts — authenticated admin OAuth start.
// GET ?breweryId=…[&installationId=…]: records a single-use hashed intent
// (install, or reauthorize when installationId is given) and 303-redirects
// to Slack's authorize URL with the exact scopes and redirect URI.
import { NextResponse } from "next/server";
import { buildContext } from "@/lib/commands/context";
import { CommandError } from "@/lib/commands/registry";
import { beginSlackInstall, beginSlackReauthorization } from "@/lib/chat/oauth";

export function slackRedirectUri(request: Request) {
  return `${process.env.APP_URL ?? new URL(request.url).origin}/api/chat/slack/oauth`;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const breweryId = params.get("breweryId");
  const installationId = params.get("installationId");
  if (!breweryId) return NextResponse.json({ ok: false, error: "breweryId required" }, { status: 400 });
  try {
    const ctx = await buildContext(breweryId);
    const redirectUri = slackRedirectUri(request);
    const { authorizeUrl } = installationId
      ? await beginSlackReauthorization(ctx, installationId, redirectUri)
      : await beginSlackInstall(ctx, redirectUri);
    return NextResponse.redirect(authorizeUrl, 303);
  } catch (e) {
    if (e instanceof CommandError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error("slack install start failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
