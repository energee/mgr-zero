import { createUIMessageStreamResponse, gateway, isStepCount, streamText, toUIMessageStream } from "ai";
import { consumeAdmission } from "@/lib/commands/admission";
import { buildRouteContext } from "@/lib/commands/context";
import { CommandError, runCommand, type Ctx } from "@/lib/commands/registry";
import { createComposerTools } from "@/lib/chat/agent";
import { buildModelMessages, type StoredChatMessage } from "@/lib/chat/model-messages";
import { readChatRequest } from "@/lib/chat/request";
import { isChatConfigured } from "@/lib/env/server-parser";
import { encodeChatFailure, type ChatFailureCode } from "@/lib/chat/failure";
import { providerFailureCode } from "@/lib/chat/provider-failure";
import "@/lib/commands/all";

const SYSTEM = `You are MGR, a concise brewery operations assistant. Use tools for brewery facts; never invent records, quantities, units, identifiers, or current state. Ask one focused question when required input is missing or ambiguous. Writes are proposals only: explain the exact server preview and tell the user to confirm it in the interface. Never claim a write happened from a tool call.`;

function execution(requestId = crypto.randomUUID()) {
  return { requestId, correlationId: crypto.randomUUID(), origin: "ui" as const };
}

export async function POST(req: Request) {
  try {
    const body = await readChatRequest(req);
    const context = await buildRouteContext(body.breweryId, body.expectedContext);
    if (context.breweryId === null) throw new CommandError("brewery context required", 403, "permission_denied");
    if (!isChatConfigured()) {
      return new Response(encodeChatFailure("not_configured"), { status: 503 });
    }
    // Same per-user budget as /api/command (#459): each turn can run several model steps and tool queries.
    const admission = await consumeAdmission(context.db);
    if (!admission.allowed) {
      return new Response(encodeChatFailure("rate_limited"),
        { status: 429, headers: { "Retry-After": String(admission.retryAfter) } });
    }
    const ctx = context as Ctx;
    const [history, ai] = await Promise.all([runCommand("get_chat_history", { conversationId: body.id }, ctx), runCommand("get_brewery_ai_model", {}, ctx)]) as [{
      messages: StoredChatMessage[];
    }, { model: string }];
    await runCommand("append_chat_message", { conversationId: body.id, role: "user", content: body.text }, ctx, execution(body.message.id));
    const messages = buildModelMessages(history.messages, { id: body.message.id, text: body.text });
    const result = streamText({
      model: gateway(ai.model),
      maxOutputTokens: 2000,
      // Recovery is explicit in the drawer; do not silently repeat a credit/access denial wrapped in a 500.
      maxRetries: 0,
      abortSignal: req.signal,
      system: SYSTEM,
      messages,
      tools: createComposerTools(ctx, body.id),
      stopWhen: isStepCount(5),
      onError: ({ error }) => { console.error("chat stream failed", { code: providerFailureCode(error) }); },
      onEnd: async ({ text }) => {
        if (text.trim()) await runCommand("append_chat_message", { conversationId: body.id, role: "assistant", content: text.slice(0, 4000) }, ctx, execution());
      },
    });
    return createUIMessageStreamResponse({ stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => encodeChatFailure(providerFailureCode(error)),
    }) });
  } catch (error) {
    if (error instanceof CommandError) {
      let code: ChatFailureCode = "request_rejected";
      if (error.status === 429) code = "rate_limited";
      else if (error.status >= 500) code = "unavailable";
      return new Response(encodeChatFailure(code), { status: error.status });
    }
    const code = providerFailureCode(error);
    console.error("chat request failed", { code });
    return new Response(encodeChatFailure(code), { status: 500 });
  }
}
