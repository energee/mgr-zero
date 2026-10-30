import { STAFF_NAV, UNLISTED_NAV, navFor, shippedNav } from "@/lib/mgr/nav";
import type { StaffRole } from "@/lib/commands/registry";

export function searchCacheKey(breweryId: string, term: string) {
  return `mgr-search:${breweryId}:${term.trim().toLowerCase()}`;
}

export function searchLoading(term: string, answeredTerm: string, status: string) {
  return term !== "" && (status === "loading" || term !== answeredTerm);
}

export function searchDestinations(roles: readonly StaffRole[], term: string) {
  const query = term.trim().toLowerCase();
  if (!query) return [];
  return [...navFor(shippedNav(STAFF_NAV), roles).flatMap(item => [item, ...(item.children ?? [])]), ...navFor(UNLISTED_NAV, roles)]
    .filter(item => item.label.toLowerCase().includes(query));
}

/** Where the palette's record search stands for the current term. */
export type SearchStatus = "idle" | "loading" | "ready" | "error" | "offline";

/**
 * What the palette says when it lists nothing: a first-use hint before any
 * term, a no-match note once a search finished empty, and nothing while one
 * loads, fails or is offline (the palette shows those states itself).
 */
export function searchEmptyMessage(term: string, status: SearchStatus) {
  const what = "a page name, record name, or document number";
  if (!term) return `Type ${what}.`;
  if (status !== "ready") return "";
  return `No pages or records found · Try ${what}.`;
}
