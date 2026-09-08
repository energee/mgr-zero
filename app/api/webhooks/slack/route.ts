// Slack events hand off to the App Home worker. Interactive callbacks record
// a receipt before SDK dispatch and commit integration state before ACK;
// pending receipts return 503 so provider retries cannot lose an action.
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
    } catch { return retry(); }
  }
  const response = await chat().webhooks.slack(request, { waitUntil });
  if (!response.ok) return response;
  try { await recordSlackCallback(raw); } catch { return retry(); }
  return response;
}
