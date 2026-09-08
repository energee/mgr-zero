// OAuth starts through the authenticated command POST after explicit consent.
// Legacy links land on the settings controls; GET never creates an intent.
import { NextResponse } from "next/server";
export function slackRedirectUri(request: Request) {
  return `${process.env.APP_URL ?? new URL(request.url).origin}/api/chat/slack/oauth`;
}
export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/settings/chat", request.url), 303);
}
