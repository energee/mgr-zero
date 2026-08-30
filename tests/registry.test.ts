import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineCommand, runCommand, _clearRegistry, CommandError } from "@/lib/commands/registry";

describe("command registry", () => {
  it("validates input and runs handler", async () => {
    _clearRegistry();
    defineCommand({
      name: "echo", input: z.object({ msg: z.string() }), roles: ["admin"],
      handler: async (_ctx, input) => ({ echoed: input.msg }),
    });
    const ctx = { db: null as any, userId: "u", breweryId: "b", role: "admin" as const };
    await expect(runCommand("echo", { msg: "hi" }, ctx)).resolves.toEqual({ echoed: "hi" });
    await expect(runCommand("echo", { msg: 5 }, ctx)).rejects.toThrow(/validation/i);
  });

  it("rejects wrong role", async () => {
    const ctx = { db: null as any, userId: "u", breweryId: "b", role: "warehouse" as const };
    await expect(runCommand("echo", { msg: "hi" }, ctx)).rejects.toThrow(/permission/i);
  });

  it("wraps handler errors as CommandError", async () => {
    _clearRegistry();
    defineCommand({
      name: "failing", input: z.object({}), roles: ["admin"],
      handler: async () => { throw new Error("db connection failed"); },
    });
    const ctx = { db: null as any, userId: "u", breweryId: "b", role: "admin" as const };
    try {
      await runCommand("failing", {}, ctx);
      throw new Error("should have thrown");
    } catch (e: unknown) {
      expect(e instanceof CommandError).toBe(true);
      expect(e instanceof Error && e.message).toBe("db connection failed");
    }
  });
});
