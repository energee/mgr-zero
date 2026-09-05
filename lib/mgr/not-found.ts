// lib/mgr/not-found.ts — how a detail page turns a missing record into the
// (app) not-found route. A get_* query rejects with 404 `not_found` when the
// id matches nothing the caller may see, and 400 `invalid_input` when the id
// is not a UUID at all; both mean "no such record" to a visitor, so both
// render app/(app)/not-found.tsx instead of the error boundary.
import { notFound } from "next/navigation";
import { CommandError } from "@/lib/commands/registry";

export function isMissingRecord(e: unknown): boolean {
  return e instanceof CommandError && (e.code === "not_found" || e.code === "invalid_input");
}

// Awaits a registry read; a missing record calls notFound(), anything else rethrows.
export async function orNotFound<T>(read: Promise<T>): Promise<T> {
  try {
    return await read;
  } catch (e) {
    if (isMissingRecord(e)) notFound();
    throw e;
  }
}
