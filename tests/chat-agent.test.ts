// AI composer boundary: role-scoped registry tools, bounded reads and preview-only writes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { _clearRegistry, defineCommand, defineQuery, type Ctx } from "@/lib/commands/registry";
import { boundToolResult, createComposerTools } from "@/lib/chat/agent";

const ctx = { db: null, userId: "actor", breweryId: "brewery", role: "admin" } as unknown as Ctx;
const options = { toolCallId: "call", messages: [], context: undefined, abortSignal: new AbortController().signal };

describe("composer agent tools", () => {
  beforeEach(() => _clearRegistry());

  it("runs only explicitly exposed queries allowed for the caller", async () => {
    const handler = vi.fn(async () => [{ qty: 7 }]);
    defineQuery({ name: "available", description: "Current availability", input: z.object({}), roles: ["admin"], aiExposed: true, handler });
    defineQuery({ name: "hidden", input: z.object({}), roles: ["admin"], handler });
    defineQuery({ name: "wrong_role", input: z.object({}), roles: ["brewer"], aiExposed: true, handler });
    const tools = createComposerTools(ctx, "conversation");
    expect(Object.keys(tools)).toEqual(["available"]);
    await expect(tools.available.execute!({}, options)).resolves.toMatchObject({ data: [{ qty: 7 }], truncated: false });
    expect(handler).toHaveBeenCalledWith(ctx, {});
  });

  it("turns an exposed write into one canonical proposal without executing it", async () => {
    const handler = vi.fn();
    const preview = vi.fn(async () => ({ effects: [{ label: "Hazy · Cold", qty: "-1" }], warnings: [], version: {}, previewToken: "preview" }));
    defineCommand({ name: "record_movement", description: "Record stock", input: z.object({ qty: z.number() }), roles: ["admin"], aiExposed: true, requiresConfirmation: true, preview, handler });
    const proposal = vi.fn();
    const tools = createComposerTools(ctx, "conversation", proposal);
    await expect(tools.record_movement.execute!({ qty: -1 }, options)).resolves.toMatchObject({ status: "awaiting_confirmation" });
    expect(handler).not.toHaveBeenCalled();
    expect(proposal).toHaveBeenCalledWith(expect.objectContaining({ name: "record_movement", input: { qty: -1 }, effects: [{ label: "Hazy · Cold", qty: "-1" }] }));
    await expect(tools.record_movement.execute!({ qty: -1 }, options)).resolves.toMatchObject({ error: expect.stringMatching(/pending/i) });
    expect(preview).toHaveBeenCalledTimes(1);
  });

  it("caps rows and rejects oversized nested results instead of implying completeness", () => {
    expect(boundToolResult(Array.from({ length: 60 }, (_, id) => ({ id })))).toMatchObject({ returned: 50, truncated: true });
    expect(boundToolResult({ content: "x".repeat(25_000) })).toMatchObject({ data: null, truncated: true, message: expect.stringMatching(/narrow/i) });
  });
});
