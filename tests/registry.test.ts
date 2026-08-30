import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineCommand, runCommand, _clearRegistry } from "@/lib/commands/registry";

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
});
