import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { defineCommand, defineQuery, runCommand, unwrap, _clearRegistry, CommandError, getCommandDefinition, type CommandExecution, type Ctx } from "@/lib/commands/registry";

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
    // Output is unknown until the caller narrows it; there is no type parameter to assert through.
    // @ts-expect-error runCommand has no output type parameter
    await expect(runCommand<{ echoed: string }>("echo", { msg: "hi" }, ctx)).resolves.toEqual({ echoed: "hi" });
    await expect(runCommand("echo", { msg: 5 }, ctx)).rejects.toThrow(/validation/i);
  });

  it("retains command and query metadata without executing a definition lookup", async () => {
    _clearRegistry();
    let executions = 0;
    defineCommand({
      name: "write", input: z.object({}), roles: ["admin"],
      handler: async (_ctx, _input, execution) => {
        executions += 1;
        return execution;
      },
    });
    defineQuery({
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

describe("unwrap maps RPC SQLSTATEs to command errors", () => {
  const failing = (code: string) => Promise.resolve({ data: null, error: { message: "boom", code } });
  it("42501 (definer authorization) → 403 permission_denied", async () => {
    await expect(unwrap(failing("42501"))).rejects.toMatchObject({ status: 403, code: "permission_denied" });
  });
  it("MG409 (request-id reuse) → 409 conflict", async () => {
    await expect(unwrap(failing("MG409"))).rejects.toMatchObject({ status: 409, code: "conflict" });
  });
  it("P0001 (a domain rule raised by our own RPCs) → 400 bad_request with its message", async () => {
    await expect(unwrap(failing("P0001"))).rejects.toMatchObject({ status: 400, code: "bad_request", message: "boom" });
  });
  it("PGRST116 (PostgREST: zero or many rows for .single()) → 404 not_found without the raw message", async () => {
    await expect(unwrap(failing("PGRST116"))).rejects.toMatchObject({ status: 404, code: "not_found", message: "record not found" });
  });
  it("any other database error → 500 db_error with a generic message; the original is logged", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(unwrap(failing("23514"))).rejects.toMatchObject({ status: 500, code: "db_error", message: "database error" });
    expect(log).toHaveBeenCalledWith("database error 23514:", "boom");
    log.mockRestore();
  });
});
