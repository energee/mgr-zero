import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineCommand, defineQuery, runCommand, _clearRegistry, CommandError, getCommandDefinition, type CommandExecution, type Ctx } from "@/lib/commands/registry";

// These unit tests never access the database; handlers exercise registry behavior only.
const testDb = null as unknown as Ctx["db"];

describe("command registry", () => {
  it("validates input and runs handler", async () => {
    _clearRegistry();
    defineCommand({
      name: "echo", input: z.object({ msg: z.string() }), roles: ["admin"],
      handler: async (_ctx, input) => ({ echoed: input.msg }),
    });
    const ctx = { db: testDb, userId: "u", breweryId: "b", role: "admin" as const };
    await expect(runCommand("echo", { msg: "hi" }, ctx)).resolves.toEqual({ echoed: "hi" });
    await expect(runCommand("echo", { msg: 5 }, ctx)).rejects.toThrow(/validation/i);
  });

  it("retains command and query metadata without executing a definition lookup", async () => {
    _clearRegistry();
    let executions = 0;
    const write = defineCommand({
      name: "write", input: z.object({}), roles: ["admin"],
      handler: async (_ctx, _input, execution) => {
        executions += 1;
        return execution;
      },
    });
    const read = defineQuery({
      name: "read", input: z.object({}), roles: ["admin"],
      handler: async () => ({ ok: true }),
    });
    const execution: CommandExecution = {
      requestId: "c1fd34ef-bb45-4f64-bff6-6a78d16129cc",
      correlationId: "4b6017b6-66e9-469d-8d83-3f6f7f2db667",
    };
    const ctx = { db: testDb, userId: "u", breweryId: "b", role: "admin" as const };

    const writeMetadata = getCommandDefinition("write");
    const readMetadata = getCommandDefinition("read");
    expect(writeMetadata).toMatchObject({ name: "write", kind: "command" });
    expect(readMetadata).toMatchObject({ name: "read", kind: "query" });
    expect(writeMetadata).not.toHaveProperty("handler");
    expect(writeMetadata).not.toHaveProperty("execute");
    expect(readMetadata).not.toHaveProperty("handler");
    expect(readMetadata).not.toHaveProperty("execute");
    expect(executions).toBe(0);
    await expect(runCommand("write", {}, ctx, execution)).resolves.toEqual(execution);
    await expect(runCommand("read", {}, ctx)).resolves.toEqual({ ok: true });
    expect(executions).toBe(1);
  });

  it("rejects wrong role", async () => {
    _clearRegistry();
    defineCommand({
      name: "echo", input: z.object({ msg: z.string() }), roles: ["admin"],
      handler: async (_ctx, input) => ({ echoed: input.msg }),
    });
    const ctx = { db: testDb, userId: "u", breweryId: "b", role: "warehouse" as const };
    await expect(runCommand("echo", { msg: "hi" }, ctx)).rejects.toThrow(/permission/i);
  });

  it("handler plain Error falls through without wrapping", async () => {
    _clearRegistry();
    defineCommand({
      name: "failing", input: z.object({}), roles: ["admin"],
      handler: async () => { throw new Error("db connection failed"); },
    });
    const ctx = { db: testDb, userId: "u", breweryId: "b", role: "admin" as const };
    try {
      await runCommand("failing", {}, ctx);
      throw new Error("should have thrown");
    } catch (e: unknown) {
      expect(e instanceof CommandError).toBe(false);
      expect(e instanceof Error && e.message).toBe("db connection failed");
    }
  });

  it("handler CommandError passes through", async () => {
    _clearRegistry();
    defineCommand({
      name: "controlled", input: z.object({}), roles: ["admin"],
      handler: async () => { throw new CommandError("validation failed: item not found"); },
    });
    const ctx = { db: testDb, userId: "u", breweryId: "b", role: "admin" as const };
    try {
      await runCommand("controlled", {}, ctx);
      throw new Error("should have thrown");
    } catch (e: unknown) {
      expect(e instanceof CommandError).toBe(true);
      expect(e instanceof CommandError && e.code).toBe("bad_request");
      expect(e instanceof Error && e.message).toBe("validation failed: item not found");
    }
  });
});
