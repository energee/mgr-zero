// tests/team.test.ts — Program 10 task 5: Team roster with @handles, one
// member's role changed in one write, a membership ended in one write. The
// brewery never loses its last admin; nobody removes themselves; only admins
// write; the Auth user survives a revoke (re-invite is the compensation).
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaff, makeStaffCtx } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
type Member = { userId: string; email: string; handle: string; role: string };
let b: { id: string }, adminCtx: Ctx, sales: Ctx;

beforeAll(async () => {
  b = await makeBrewery();
  adminCtx = await makeStaffCtx(b.id, "admin");
  sales = await makeStaffCtx(b.id, "sales");
});

const roster = async (ctx: Ctx = adminCtx) => runCommand("list_team_members", {}, ctx) as Promise<Member[]>;

describe("team", () => {
  it("lists members with email and @handle", async () => {
    const me = (await roster()).find((m) => m.userId === adminCtx.userId)!;
    expect(me.role).toBe("admin");
    expect(me.email).toContain("@");
    expect(me.handle).toBe(`@${me.email.split("@")[0]}`);
    await expect(roster(sales)).resolves.toBeTruthy();
  });

  it("changes one member's role; the last admin cannot step down", async () => {
    await expect(runCommand("update_staff_role", { userId: adminCtx.userId, role: "sales" }, adminCtx)).rejects.toThrow(/admin/);
    await runCommand("update_staff_role", { userId: sales.userId, role: "warehouse" }, adminCtx);
    expect((await roster()).find((m) => m.userId === sales.userId)?.role).toBe("warehouse");
    await expect(runCommand("update_staff_role", { userId: adminCtx.userId, role: "sales" }, sales)).rejects.toThrow(/permission denied/);
  });

  it("revokes a membership but never self or the last admin, and keeps the Auth user", async () => {
    const other = await makeStaff(b.id, "admin");
    await expect(runCommand("revoke_staff", { userId: adminCtx.userId }, adminCtx)).rejects.toThrow(/yourself/);
    await runCommand("revoke_staff", { userId: other.id }, adminCtx);
    expect((await roster()).some((m) => m.userId === other.id)).toBe(false);
    expect((await admin.auth.admin.getUserById(other.id)).data.user?.id).toBe(other.id);
    await expect(runCommand("revoke_staff", { userId: sales.userId }, sales)).rejects.toThrow(/permission denied/);
    // the only admin left cannot be revoked by a second admin who then revokes themselves first
    const second = await makeStaffCtx(b.id, "admin");
    await runCommand("revoke_staff", { userId: adminCtx.userId }, second);
    await expect(runCommand("revoke_staff", { userId: second.userId }, second)).rejects.toThrow(/yourself/);
    await runCommand("update_staff_role", { userId: sales.userId, role: "admin" }, second);
    const promoted = { ...sales, role: "admin" as const }; // the registry reads ctx.role; the RPC re-derives it from the row
    await runCommand("revoke_staff", { userId: second.userId }, promoted);
    await expect(runCommand("update_staff_role", { userId: sales.userId, role: "brewer" }, promoted)).rejects.toThrow(/admin/);
  });
});
