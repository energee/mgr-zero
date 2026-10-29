import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { canRun, defineCommand, defineQuery, runCommand, unwrap, _clearRegistry, CommandError, getCommandDefinition, type CommandExecution, type Ctx } from "@/lib/commands/registry";

// These unit tests never access the database; handlers exercise registry behavior only.
const testDb = null as unknown as Ctx["db"];

describe("command registry", () => {
  it("replaces a definition re-evaluated by development HMR", async () => {
    _clearRegistry();
    vi.stubEnv("NODE_ENV", "development");
    defineQuery({ name: "hmr_read", input: z.object({}), roles: ["admin"], handler: async () => "old" });
    defineQuery({ name: "hmr_read", input: z.object({}), roles: ["admin"], handler: async () => "new" });
    vi.unstubAllEnvs();

    const ctx: Ctx = { db: testDb, userId: "u", breweryId: "b", roles: ["admin"] };
    await expect(runCommand("hmr_read", {}, ctx)).resolves.toBe("new");
  });

  it("still rejects duplicate definitions outside development", () => {
    _clearRegistry();
    defineQuery({ name: "duplicate_read", input: z.object({}), roles: ["admin"], handler: async () => null });
    expect(() => defineQuery({ name: "duplicate_read", input: z.object({}), roles: ["admin"], handler: async () => null }))
      .toThrow("duplicate command: duplicate_read");
  });

  it("validates input and runs handler", async () => {
    _clearRegistry();
    defineCommand({
      name: "echo", input: z.object({ msg: z.string() }), roles: ["admin"],
      handler: async (_ctx, input) => ({ echoed: input.msg }),
    });
    const ctx: Ctx = { db: testDb, userId: "u", breweryId: "b", roles: ["admin"] };
    await expect(runCommand("echo", { msg: "hi" }, ctx)).resolves.toEqual({ echoed: "hi" });
    // Output is unknown until the caller narrows it; there is no type parameter to assert through.
    // @ts-expect-error runCommand has no output type parameter
    await expect(runCommand<{ echoed: string }>("echo", { msg: "hi" }, ctx)).resolves.toEqual({ echoed: "hi" });
    await expect(runCommand("echo", { msg: 5 }, ctx)).rejects.toMatchObject({ code: "invalid_input", issues: [{ path: ["msg"], code: "invalid_type", message: expect.any(String) }] });
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
      origin: "ui",
    };
    const ctx: Ctx = { db: testDb, userId: "u", breweryId: "b", roles: ["admin"] };

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
    const ctx: Ctx = { db: testDb, userId: "u", breweryId: "b", roles: ["warehouse", "brewer"] };
    await expect(runCommand("echo", { msg: "hi" }, ctx)).rejects.toThrow(/permission/i);
  });

  it("grants the union of sales and brewer commands without granting admin", async () => {
    _clearRegistry();
    for (const role of ["sales", "brewer", "admin"] as const) {
      defineCommand({ name: `${role}_write`, input: z.object({}), roles: [role], handler: async () => role });
    }
    const ctx: Ctx = { db: testDb, userId: "u", breweryId: "b", roles: ["sales", "brewer"] };
    for (const role of ["sales", "brewer"]) {
      expect(canRun(ctx, `${role}_write`)).toBe(true);
      await expect(runCommand(`${role}_write`, {}, ctx)).resolves.toBe(role);
    }
    const warehouseBrewer: Ctx = { ...ctx, roles: ["warehouse", "brewer"] };
    expect(canRun(warehouseBrewer, "admin_write")).toBe(false);
    await expect(runCommand("admin_write", {}, warehouseBrewer)).rejects.toMatchObject({ status: 403, code: "permission_denied" });
  });

  it("keeps explicit portal and staff role contexts separate", async () => {
    _clearRegistry();
    defineQuery({ name: "staff_read", input: z.object({}), roles: ["admin", "sales"], handler: async () => "staff" });
    defineQuery({ name: "portal_read", input: z.object({}), roles: "customer", handler: async () => "portal" });
    const staff: Ctx = { db: testDb, userId: "u", breweryId: "b", roles: ["admin", "sales"] };
    const portal: Ctx = { ...staff, roles: ["customer"], customerId: "c" };
    expect(canRun(staff, "portal_read")).toBe(false);
    expect(canRun(portal, "staff_read")).toBe(false);
    await expect(runCommand("portal_read", {}, portal)).resolves.toBe("portal");
    await expect(runCommand("staff_read", {}, portal)).rejects.toMatchObject({ status: 403 });
    const mixed: Ctx = { ...portal, roles: ["customer", "admin"] };
    expect(canRun(mixed, "staff_read")).toBe(false);
    expect(canRun(mixed, "portal_read")).toBe(false);
  });

  it("handler plain Error falls through without wrapping", async () => {
    _clearRegistry();
    defineCommand({
      name: "failing", input: z.object({}), roles: ["admin"],
      handler: async () => { throw new Error("db connection failed"); },
    });
    const ctx: Ctx = { db: testDb, userId: "u", breweryId: "b", roles: ["admin"] };
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
    const ctx: Ctx = { db: testDb, userId: "u", breweryId: "b", roles: ["admin"] };
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
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(unwrap(Promise.resolve({ data: null, error: { message: "new row violates RLS on private.secret", code: "42501" } })))
      .rejects.toMatchObject({ status: 403, code: "permission_denied", message: "permission denied" });
    expect(log).toHaveBeenCalledWith("database error 42501:", "new row violates RLS on private.secret");
    log.mockRestore();
  });
  it("MG409 (request-id reuse) → 409 conflict", async () => {
    await expect(unwrap(failing("MG409"))).rejects.toMatchObject({ status: 409, code: "conflict" });
  });
  it("MGC01 maps a duplicate channel name separately from request-id reuse", async () => {
    await expect(unwrap(Promise.resolve({ data: null, error: { code: "MGC01", message: "A channel named DTC already exists." } })))
      .rejects.toMatchObject({ status: 409, code: "duplicate_channel_name", message: "A channel named DTC already exists." });
  });
  it("MG404 (a scoped RPC hides an absent or other-tenant identity) → 404 not_found with its message", async () => {
    await expect(unwrap(failing("MG404"))).rejects.toMatchObject({ status: 404, code: "not_found", message: "boom" });
  });
  it("P0001 (a domain rule raised by our own RPCs) → 400 bad_request with its message", async () => {
    await expect(unwrap(failing("P0001"))).rejects.toMatchObject({ status: 400, code: "bad_request", message: "boom" });
  });
  it("PGRST116 (PostgREST: zero or many rows for .single()) → 404 not_found without the raw message", async () => {
    await expect(unwrap(failing("PGRST116"))).rejects.toMatchObject({ status: 404, code: "not_found", message: "record not found" });
  });
  it("23505 (unique violation) → 409 conflict with a readable message; the constraint name is only logged (#422)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = 'duplicate key value violates unique constraint "locations_brewery_id_name_key"';
    const err = await unwrap(Promise.resolve({ data: null, error: { message: raw, code: "23505" } })).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 409, code: "conflict", message: "That already exists. Use a different name or value." });
    expect((err as Error).message).not.toMatch(/constraint|locations_/);
    expect(log).toHaveBeenCalledWith("database error 23505:", raw);
    log.mockRestore();
  });
  it.each([
    "Key (brewery_id, name)=(00000000-0000-4000-8000-000000000001, QA test customer) already exists.",
    "Key (brewery_id, btrim(name))=(00000000-0000-4000-8000-000000000001, ½ bbl keg) already exists.",
  ])("23505 on a name key → 409 conflict that names the Name field, without the raw value (#1488): %s", async details => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await unwrap(Promise.resolve({ data: null, error: { message: "duplicate key value violates unique constraint", code: "23505", details } })).catch((e: unknown) => e);
    const message = "That name is already used. Choose a different name.";
    expect(err).toMatchObject({ status: 409, code: "conflict", message, issues: [{ path: ["name"], code: "duplicate", message }] });
    expect(JSON.stringify(err)).not.toMatch(/QA test|bbl|0000/);
    log.mockRestore();
  });
  it("23505 on a label key → 409 conflict that names the Label field, without the raw value (#1487)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const details = "Key (brewery_id, customer_id, lower(btrim(label)))=(00000000-0000-4000-8000-000000000001, 00000000-0000-4000-8000-000000000002, qa test dock) already exists.";
    const err = await unwrap(Promise.resolve({ data: null, error: { message: "duplicate key value violates unique constraint", code: "23505", details } })).catch((e: unknown) => e);
    const message = "That label is already used. Choose a different label.";
    expect(err).toMatchObject({ status: 409, code: "conflict", message, issues: [{ path: ["label"], code: "duplicate", message }] });
    expect(JSON.stringify(err)).not.toMatch(/qa test|0000/);
    log.mockRestore();
  });
  it("23505 on another key keeps the generic conflict and no field issue", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await unwrap(Promise.resolve({ data: null, error: { message: "dup", code: "23505", details: "Key (brewery_id, rpc_name)=(x, y) already exists." } })).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 409, code: "conflict", message: "That already exists. Use a different name or value." });
    expect((err as CommandError).issues).toBeUndefined();
    log.mockRestore();
  });
  it("22003 (numeric value out of range) → 400 bad_request without the raw message (#427)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(unwrap(failing("22003"))).rejects.toMatchObject({ status: 400, code: "bad_request", message: "A number is out of range." });
    log.mockRestore();
  });
  it.each(["a customer name is required", "invalid argument for private.internal_function"])("22023 → 400 invalid_input without raw database text: %s", async message => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(unwrap(Promise.resolve({ data: null, error: { code: "22023", message } })))
      .rejects.toMatchObject({ status: 400, code: "invalid_input", message: "An input value is invalid." });
    expect(log).toHaveBeenCalledWith("database error 22023:", message);
    log.mockRestore();
  });
  it("any other database error → 500 db_error with a generic message; the original is logged", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(unwrap(failing("23514"))).rejects.toMatchObject({ status: 500, code: "db_error", message: "database error" });
    expect(log).toHaveBeenCalledWith("database error 23514:", "boom");
    log.mockRestore();
  });
});
