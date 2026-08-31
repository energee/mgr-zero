// app/(app)/settings/team/page.tsx — staff roster + invite entry point.
// Scoped to the active brewery (getActiveBrewery + .eq("brewery_id", ...)):
// RLS alone isn't enough here because a user who is staff at two breweries
// would otherwise see a merged roster of both under one brewery's header.
// auth.users is not readable under RLS, so we can only show role + user_id
// for existing members here (no email column exists to join against).
// InviteForm's optimistic append shows the invited email until the page is
// refreshed. Full member management (remove, change role, search by email)
// is out of scope for this pass.
import { createServerClient } from "@/lib/supabase/server";
import { getActiveBrewery } from "@/lib/brewery";
import { InviteForm } from "./invite-form";

type Membership = {
  user_id: string;
  role: string;
};

export default async function TeamPage() {
  const brewery = await getActiveBrewery();
  const db = await createServerClient();
  const { data: members, error } = await db
    .from("brewery_users")
    .select("user_id, role")
    .eq("brewery_id", brewery.id)
    .order("role");

  if (error) {
    return <p className="text-sm text-red-600">Failed to load team: {error.message}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Team</h1>
        <InviteForm />
      </div>

      <p className="text-sm text-muted-foreground">
        Emails aren&apos;t shown here — Supabase auth data isn&apos;t readable under
        row-level security, so each row below is identified by user id and role only.
      </p>

      {(members as Membership[] | null)?.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-normal">User ID</th>
              <th className="py-1 font-normal">Role</th>
            </tr>
          </thead>
          <tbody>
            {(members as Membership[]).map((m) => (
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
