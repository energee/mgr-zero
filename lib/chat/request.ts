import { z } from "zod";

const requestSchema = z.object({
  id: z.uuid(),
  breweryId: z.uuid(),
  expectedContext: z.object({ actorId: z.uuid(), breweryId: z.uuid() }).strict().optional(),
  message: z.object({
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
