// app/api/webhooks/slack/route.ts — Chat SDK Slack webhook. The SDK verifies
// the signature/timestamp and answers URL verification; only after it accepts
// the request do we record a durable receipt from the raw body (App Home
// opens) for the worker. Slow work never runs inline: the route answers within
// Slack's 3 s budget and the receipt is the handoff.
import { after } from "next/server";
import { chat } from "@/lib/chat/slack-adapter";
import { recordSlackCallback } from "@/lib/chat/jobs";

// In a Next request scope `after()` keeps the function alive for background
// work; outside one (tests) the task simply runs detached.
function waitUntil(task: Promise<unknown>) {
  try { after(() => task); } catch { void task.catch(() => undefined); }
}

export async function POST(request: Request) {
  const raw = await request.clone().text();
  const response = await chat().webhooks.slack(request, { waitUntil });
  if (!response.ok) return response;
  try {
    await recordSlackCallback(raw);
  } catch (e) {
    // Spec: an untracked callback must not be processed — ask Slack to retry.
    console.error("slack receipt not recorded:", e instanceof Error ? e.message : e);
    return new Response("receipt unavailable", { status: 503, headers: { "retry-after": "5" } });
  }
  return response;
}
