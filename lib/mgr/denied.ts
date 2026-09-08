// lib/mgr/denied.ts — how a page turns a refused read into the Permission
// denied screen (screen record Permission denied). Navigation hides what a
// role may not open, but a bookmarked URL still lands on the page, whose
// first registry read is refused with 403 permission_denied. orDenied()
// catches exactly that and redirects to /denied with what was refused and the
// roles that would satisfy it; every other failure still reaches error.tsx.
// deniedCopy() is the pure half the page and its test share.
import { redirect } from "next/navigation";
import { CommandError, getCommandDefinition } from "@/lib/commands/registry";

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

/** Awaits a page's registry read; a 403 becomes the Permission denied screen for `resource`. */
export async function orDenied<T>(read: Promise<T>, resource: string, command?: string): Promise<T> {
  try {
    return await read;
  } catch (e) {
    if (e instanceof CommandError && e.code === "permission_denied") {
      const needs = command ? [...(getCommandDefinition(command)?.roles ?? [])].filter((r) => r !== "customer") : [];
      redirect(deniedHref(resource, needs));
    }
    throw e;
  }
}
