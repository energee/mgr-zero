// Ask MGR boundary: the shared read tools, bounded results and preview-only writes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { _clearRegistry, defineCommand, defineQuery, type Ctx } from "@/lib/commands/registry";
import { boundToolResult, createComposerTools } from "@/lib/chat/agent";

const ctx = { db: null, userId: "actor", breweryId: "brewery", roles: ["admin"] } as unknown as Ctx;
const options = { toolCallId: "call", messages: [], context: undefined, abortSignal: new AbortController().signal };

describe("composer agent tools", () => {
  beforeEach(() => _clearRegistry());

  it("finds, describes and runs any read the caller's role allows", async () => {
    const handler = vi.fn(async () => [{ qty: 7 }]);
    defineQuery({ name: "available", description: "Current availability", input: z.object({ sku: z.string().optional() }), roles: ["admin"], handler });
    defineQuery({ name: "wrong_role", input: z.object({}), roles: ["brewer"], handler });
    defineQuery({ name: "provider_secret", input: z.object({}), roles: ["admin"], agentHidden: true, handler });
    defineCommand({ name: "plain_write", input: z.object({}), roles: ["admin"], handler });
    const tools = createComposerTools(ctx, "conversation");
    expect(Object.keys(tools)).toEqual(["find_operations", "describe_operation", "run_query"]);
    await expect(tools.find_operations.execute!({}, options)).resolves.toEqual([{ name: "available", description: "Current availability", kind: "query" }]);
    await expect(tools.describe_operation.execute!({ name: "available" }, options)).resolves.toMatchObject({ name: "available", example: expect.any(Object) });
    await expect(tools.run_query.execute!({ name: "available" }, options)).resolves.toMatchObject({ data: [{ qty: 7 }], truncated: false });
    expect(handler).toHaveBeenCalledWith(ctx, {});
  });

  // A person's context has no ctx.agent, so runCommand would run these. run_query is the guard.
  it("will not run a write, a hidden read or another role's read", async () => {
    const handler = vi.fn(async () => null);
    defineQuery({ name: "wrong_role", input: z.object({}), roles: ["brewer"], handler });
    defineQuery({ name: "provider_secret", input: z.object({}), roles: ["admin"], agentHidden: true, handler });
    defineCommand({ name: "plain_write", input: z.object({}), roles: ["admin"], handler });
    const tools = createComposerTools(ctx, "conversation");
    for (const name of ["plain_write", "provider_secret", "wrong_role", "no_such_operation"]) {
      await expect(tools.run_query.execute!({ name }, options)).rejects.toMatchObject({ code: "agent_not_allowed" });
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it("will not run a previewed write as a read", async () => {
    const handler = vi.fn();
    const preview = vi.fn(async () => ({ effects: [], warnings: [], version: {}, previewToken: "preview" }));
    defineCommand({ name: "record_movement", input: z.object({}), roles: ["admin"], requiresConfirmation: true, preview, handler });
    await expect(createComposerTools(ctx, "conversation").run_query.execute!({ name: "record_movement" }, options)).rejects.toMatchObject({ code: "agent_not_allowed" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("turns a previewed write into one canonical proposal without executing it", async () => {
    const handler = vi.fn();
    const preview = vi.fn(async () => ({ effects: [{ label: "Hazy · Cold", qty: "-1" }], warnings: [], version: {}, previewToken: "preview" }));
    defineCommand({ name: "record_movement", description: "Record stock", input: z.object({ qty: z.number() }), roles: ["admin"], requiresConfirmation: true, preview, handler });
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
