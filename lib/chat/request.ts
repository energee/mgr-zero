import { z } from "zod";
import { CommandError } from "@/lib/commands/registry";

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
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_CHAT_BODY_BYTES) throw new CommandError("request body is too large", 413, "request_too_large");
  if (!req.body) throw new CommandError("request body must be JSON", 400, "invalid_request");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_CHAT_BODY_BYTES) { await reader.cancel(); throw new CommandError("request body is too large", 413, "request_too_large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return parseChatRequest(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))); }
  catch (error) { if (error instanceof CommandError) throw error; throw new CommandError("invalid chat request", 400, "invalid_request"); }
}
