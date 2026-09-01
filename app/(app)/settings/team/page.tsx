// app/(app)/settings/team/page.tsx — staff roster (read-only; invitations are
// not available in this release — audit P1.9). Reads
// through the command registry (list_team_members) with a brewery-scoped Ctx.
// auth.users is not readable under RLS, so rows show role + user_id only; full
// member management (remove, change role) is out of scope for this pass.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Membership = { user_id: string; role: string };

export default async function TeamPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const members = (await runCommand("list_team_members", {}, ctx)) as Membership[];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Team</h1>

      <p className="text-sm text-muted-foreground">
        Emails aren&apos;t shown here — Supabase auth data isn&apos;t readable under
        row-level security, so each row below is identified by user id and role only.
      </p>

      {members.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-normal">User ID</th>
              <th className="py-1 font-normal">Role</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id} className="border-t">
                <td className="py-1 font-mono text-xs">{m.user_id}</td>
                <td className="py-1">{m.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-muted-foreground">No staff members yet.</p>
      )}
    </div>
  );
}
