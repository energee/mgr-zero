import { z } from "zod";
import { CommandError } from "@/lib/commands/registry";
import { readBoundedJson } from "@/lib/request-json";

const MAX_CHAT_BODY_BYTES = 24 * 1024;

const requestSchema = z.object({
  id: z.uuid(),
  breweryId: z.uuid(),
  expectedContext: z.object({ actorId: z.uuid(), breweryId: z.uuid() }).strict().optional(),
  message: z.object({
    id: z.uuid(),
    role: z.literal("user"),
    parts: z.array(z.discriminatedUnion("type", [z.object({ type: z.literal("text"), text: z.string().max(4000) }).strict()])).min(1),
  }).strict(),
}).strict();

export function parseChatRequest(body: unknown) {
  const parsed = requestSchema.parse(body);
  const text = parsed.message.parts.map((part) => part.text).join("").trim();
  if (!text) throw new Error("A message is required.");
  return { ...parsed, text };
}

export async function readChatRequest(req: Request) {
  try { return parseChatRequest(await readBoundedJson(req, MAX_CHAT_BODY_BYTES)); }
  catch (error) { if (error instanceof CommandError) throw error; throw new CommandError("invalid chat request", 400, "invalid_request"); }
}
