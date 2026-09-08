// OAuth starts through the authenticated command POST after explicit consent.
// Legacy links land on the settings controls; GET never creates an intent.
import { NextResponse } from "next/server";

export function slackAppOrigin() {
  const base = process.env.APP_URL;
  if (!base) throw new Error("APP_URL is not configured");
  return new URL(base).origin;
}

export function slackRedirectUri() {
  return `${slackAppOrigin()}/api/chat/slack/oauth`;
}
export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/settings/chat", request.url), 303);
}
