import { createUIMessageStreamResponse, gateway, isStepCount, streamText, toUIMessageStream, type ModelMessage } from "ai";
import { NextResponse } from "next/server";
import { buildRouteContext } from "@/lib/commands/context";
import { CommandError, runCommand, type Ctx } from "@/lib/commands/registry";
import { createComposerTools } from "@/lib/chat/agent";
import { parseChatRequest } from "@/lib/chat/request";
import "@/lib/commands/all";

const SYSTEM = `You are MGR, a concise brewery operations assistant. Use tools for brewery facts; never invent records, quantities, units, identifiers, or current state. Ask one focused question when required input is missing or ambiguous. Writes are proposals only: explain the exact server preview and tell the user to confirm it in the interface. Never claim a write happened from a tool call.`;

function execution(requestId = crypto.randomUUID()) {
  return { requestId, correlationId: crypto.randomUUID(), origin: "ui" as const };
}

export async function POST(req: Request) {
  try {
    const body = parseChatRequest(await req.json());
    const context = await buildRouteContext(body.breweryId, body.expectedContext);
    if (context.breweryId === null) throw new CommandError("brewery context required", 403, "permission_denied");
    if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
      return NextResponse.json({ error: "Chat is not configured." }, { status: 503 });
    }
    const ctx = context as Ctx;
    const history = await runCommand("get_chat_history", { conversationId: body.id }, ctx) as {
      messages: { role: "user" | "assistant" | "result"; content: string | null }[];
    };
    await runCommand("append_chat_message", { conversationId: body.id, role: "user", content: body.text }, ctx, execution(body.message.id));
    const messages: ModelMessage[] = history.messages
      .filter((message): message is { role: "user" | "assistant"; content: string } => message.role !== "result" && Boolean(message.content))
      .map((message) => ({ role: message.role, content: message.content }));
    messages.push({ role: "user", content: body.text });
    const result = streamText({
      model: gateway(process.env.AI_GATEWAY_MODEL ?? "anthropic/claude-sonnet-4.5"),
      system: SYSTEM,
      messages,
      tools: createComposerTools(ctx, body.id),
      stopWhen: isStepCount(5),
      onEnd: async ({ text }) => {
        if (text.trim()) await runCommand("append_chat_message", { conversationId: body.id, role: "assistant", content: text.slice(0, 4000) }, ctx, execution());
      },
    });
    return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) });
  } catch (error) {
    if (error instanceof CommandError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("chat error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Chat request failed." }, { status: 400 });
  }
}
