// tests/team.test.ts — Team roster with profile names and email fallback, one
// member's roles changed in one write, a membership ended in one write. The
// brewery never loses its last admin; nobody removes themselves; only admins
// write; the Auth user survives a revoke (re-invite is the compensation). A
// new-account invitee stays invited until first sign-in, and only they can be resent.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaff, makeStaffCtx, sql } from "./helpers";
import { runCommand, type StaffRole } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
type Member = { userId: string; email: string; name: string; roles: StaffRole[]; invited: boolean };
let b: { id: string }, adminCtx: Ctx, sales: Ctx;

beforeAll(async () => {
  b = await makeBrewery();
  adminCtx = await makeStaffCtx(b.id, "admin");
  sales = await makeStaffCtx(b.id, "sales");
});

const roster = async (ctx: Ctx = adminCtx) => runCommand("list_team_members", {}, ctx) as Promise<Member[]>;

describe("team", () => {
  it("lists members with their email as fallback when no profile name is saved", async () => {
    const me = (await roster()).find((m) => m.userId === adminCtx.userId)!;
    expect(me.roles).toEqual(["admin"]);
    expect(me.email).toContain("@");
    expect(me.name).toBe(me.email);
    await expect(roster(sales)).resolves.toBeTruthy();
  });

  it("shows the account email beside an editable profile name, including an impersonated role", async () => {
    const member = await makeStaff(b.id, "warehouse");
    const update = await admin.auth.admin.updateUserById(member.id, { user_metadata: { full_name: "  Owner (Admin)  " } });
    expect(update.error).toBeNull();
    const named = (await roster()).find((row) => row.userId === member.id);
    expect(named?.name).toContain("Owner (Admin)");
    expect(named?.name).toContain(member.email);
    expect(named?.email).toBe(member.email);
    const direct = await adminCtx.db.rpc("list_team_members", { p_brewery: b.id });
    expect(direct.error).toBeNull();
    const directMember = direct.data?.find((row) => row.user_id === member.id);
    expect(directMember?.name).toContain("Owner (Admin)");
    expect(directMember?.name).toContain(member.email);
    expect(directMember?.email).toBe(member.email);
    for (const fullName of [null, "", "   "]) {
      expect((await admin.auth.admin.updateUserById(member.id, { user_metadata: { full_name: fullName } })).error).toBeNull();
      expect((await roster()).find((row) => row.userId === member.id)).toMatchObject({ name: member.email, email: member.email });
    }
  });

  it("does not expose another brewery's names or let profile metadata authorize roster access", async () => {
    const other = await makeBrewery();
    const outsider = await makeStaffCtx(other.id, "admin");
    const otherMember = await makeStaff(other.id, "warehouse");
    expect((await admin.auth.admin.updateUserById(otherMember.id, { user_metadata: { full_name: "Other brewery member" } })).error).toBeNull();
    expect((await roster()).some((row) => row.userId === otherMember.id)).toBe(false);
    expect((await outsider.db.rpc("list_team_members", { p_brewery: b.id })).data).toEqual([]);
    const brewer = await makeStaffCtx(b.id, "brewer");
    expect((await admin.auth.admin.updateUserById(brewer.userId, { user_metadata: { full_name: "Admin", role: "admin" } })).error).toBeNull();
    expect((await brewer.db.rpc("list_team_members", { p_brewery: b.id })).data).toEqual([]);
  });

  it("does not hand staff emails to a role the registered query refuses", async () => {
    const brewer = await makeStaffCtx(b.id, "brewer");
    await expect(runCommand("list_team_members", {}, brewer)).rejects.toThrow(/permission denied/);
    // the definer RPC is granted to authenticated, so it has to apply the same rule
    const { data } = await brewer.db.rpc("list_team_members", { p_brewery: b.id });
    expect(data).toEqual([]);
  });

  it("changes all roles together and returns them in canonical enum order", async () => {
    await expect(runCommand("update_staff_role", { userId: adminCtx.userId, roles: ["sales"] }, adminCtx)).rejects.toThrow(/admin/);
    await runCommand("update_staff_role", { userId: sales.userId, roles: ["brewer", "warehouse", "brewer"] }, adminCtx);
    expect((await roster()).find((m) => m.userId === sales.userId)?.roles).toEqual(["warehouse", "brewer"]);
    await expect(runCommand("update_staff_role", { userId: adminCtx.userId, roles: ["sales"] }, sales)).rejects.toThrow(/permission denied/);
    await expect(runCommand("update_staff_role", { userId: sales.userId, roles: [] }, adminCtx)).rejects.toThrow();
    expect((await roster()).find((m) => m.userId === sales.userId)?.roles).toEqual(["warehouse", "brewer"]);
  });

  it("keeps admin when the last admin also has another role", async () => {
    const isolatedBrewery = await makeBrewery();
    const lastAdmin = await makeStaffCtx(isolatedBrewery.id, ["admin", "sales"]);
    await expect(runCommand("update_staff_role", { userId: lastAdmin.userId, roles: ["sales"] }, lastAdmin)).rejects.toThrow(/admin/);
    const members = await roster(lastAdmin);
    expect(members.find((m) => m.userId === lastAdmin.userId)?.roles).toEqual(["admin", "sales"]);
  });

  it("marks a new-account invitee as invited until their first sign-in, and resends only to them", async () => {
    const brewery = await makeBrewery();
    const owner = await makeStaffCtx(brewery.id, "admin");
    const address = `${crypto.randomUUID()}@test.local`;
    const { userId } = await runCommand("invite_staff", { email: address, role: "admin" }, owner) as { userId: string };
    const member = await makeStaff(brewery.id, "warehouse");
    const rows = await roster(owner);
    expect(rows.find((m) => m.userId === userId)?.invited).toBe(true);
    expect(rows.find((m) => m.userId === member.id)?.invited).toBe(false);

    const sent = sql(`select invited_at from auth.users where id = '${userId}'`)[0];
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await runCommand("resend_staff_invite", { userId }, owner);
    expect(sql(`select invited_at > '${sent}'::timestamptz from auth.users where id = '${userId}'`)).toEqual(["t"]);
    await expect(runCommand("resend_staff_invite", { userId: member.id }, owner)).rejects.toThrow(/no pending invitation/);
    await expect(runCommand("resend_staff_invite", { userId }, await makeStaffCtx(brewery.id, "sales"))).rejects.toThrow(/permission denied/);
    await expect(runCommand("resend_staff_invite", { userId }, await makeStaffCtx((await makeBrewery()).id, "admin"))).rejects.toThrow(/no pending invitation/);

    sql(`update auth.users set last_sign_in_at = now() where id = '${userId}'`);
    expect((await roster(owner)).find((m) => m.userId === userId)?.invited).toBe(false);
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
    await runCommand("update_staff_role", { userId: sales.userId, roles: ["admin"] }, second);
    const promoted = { ...sales, roles: ["admin" as const] }; // the registry reads ctx.roles; the RPC re-derives them from the row
    await runCommand("revoke_staff", { userId: second.userId }, promoted);
    await expect(runCommand("update_staff_role", { userId: sales.userId, roles: ["brewer"] }, promoted)).rejects.toThrow(/admin/);
  });
});
