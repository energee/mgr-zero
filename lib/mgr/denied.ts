// lib/mgr/denied.ts — the Permission denied screen's two pure halves (screen
// record Permission denied). Navigation hides what a role may not open, but a
// bookmarked URL still lands on the page, so an admin-only page checks the
// role and sends the visitor to deniedHref() with what was refused and the
// roles that would satisfy it. deniedCopy() is what that page then prints.
export type Denied = { resource: string; role: string; needs: string[] };

/** The three lines the Permission denied screen prints. */
export function deniedCopy({ resource, role, needs }: Denied) {
  const list = needs.length ? needs.join(" or ") : "another role";
  return {
    note: `You do not have access to ${resource}.`,
    signedInAs: role,
    needs: list,
    hint: needs.includes("admin") && needs.length === 1 ? "Ask an admin at your brewery." : "An admin can change your role in Settings, then Team.",
  };
}

export const deniedHref = (resource: string, needs: string[]) => `/denied?for=${encodeURIComponent(resource)}&needs=${encodeURIComponent(needs.join(","))}`;
