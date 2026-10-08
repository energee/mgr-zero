// Slack events and interactive callbacks record a durable receipt before SDK
// dispatch. If the receipt insert fails, return 503 so the provider retries
// instead of processing an untracked callback.
import { after } from "next/server";
import { chat, validSlackSignature } from "@/lib/chat/slack-adapter";
import { recordSlackCallback, recordSlackInteraction, slackInteraction } from "@/lib/chat/jobs";

// In a Next request scope `after()` keeps the function alive for background
// work; outside one (tests) the task simply runs detached.
function waitUntil(task: Promise<unknown>) {
  try { after(() => task); } catch { void task.catch(() => undefined); }
}

export async function POST(request: Request) {
  const raw = await request.clone().text();
  const interaction = request.headers.get("content-type")?.includes("application/x-www-form-urlencoded") ? slackInteraction(raw) : null;
  const retry = () => new Response("receipt unavailable", { status: 503, headers: { "retry-after": "5" } });
  // A failed receipt is safe to drop here only because Slack retries the 503;
  // the log keeps the cause, which the retry alone would hide.
  const failed = (error: unknown) => {
    console.error("slack webhook receipt failed:", error instanceof Error ? error.message : String(error));
    return retry();
  };
  if (interaction) {
    if (!validSlackSignature(request, raw)) return new Response("Invalid signature", { status: 401 });
    try {
      const receipt = await recordSlackInteraction(interaction);
      if (!receipt) return new Response("", { status: 200 });
      const tasks: Promise<unknown>[] = [];
      const response = await chat().webhooks.slack(request, { waitUntil: (task) => { tasks.push(task); } });
      await Promise.all(tasks);
      // SDK catches handler errors internally. A pending receipt is the durable
      // indication that no action committed; request a provider retry.
      const finished = await recordSlackInteraction(interaction);
      return finished?.disposition === "pending" || finished?.disposition === "processing" ? retry() : response;
    } catch (error) { return failed(error); }
  }
  if (!validSlackSignature(request, raw)) return new Response("Invalid signature", { status: 401 });
  try { await recordSlackCallback(raw); } catch (error) { return failed(error); }
  const response = await chat().webhooks.slack(request, { waitUntil });
  return response;
}
