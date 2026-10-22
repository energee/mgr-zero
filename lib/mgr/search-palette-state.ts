import { STAFF_NAV, navFor, shippedNav } from "@/lib/mgr/nav";
import type { StaffRole } from "@/lib/commands/registry";
import type { SearchHit, SearchKind } from "@/lib/commands/search";

export function searchCacheKey(breweryId: string, kinds: SearchKind[] | undefined, term: string) {
  return `mgr-search:${breweryId}:${kinds?.join(",") || "all"}:${term.trim().toLowerCase()}`;
}

export function searchLoading(term: string, answeredTerm: string, status: string) {
  return term !== "" && (status === "loading" || term !== answeredTerm);
}

export function restrictToOptions(hits: SearchHit[], options?: SearchHit[]) {
  return options ? hits.filter((hit) => options.some((option) => option.kind === hit.kind && option.id === hit.id)) : hits;
}

export function excludeSeen(hits: SearchHit[], recent: SearchHit[] = []) {
  return hits.filter((hit) => !recent.some((item) => item.kind === hit.kind && item.id === hit.id));
}

export function searchDestinations(roles: readonly StaffRole[], term: string) {
  const query = term.trim().toLowerCase();
  if (!query) return [];
  return navFor(shippedNav(STAFF_NAV), roles)
    .flatMap(item => [item, ...(item.children ?? [])])
    .filter(item => item.label.toLowerCase().includes(query));
}

/**
 * What the palette says when it lists nothing: a first-use hint before any
 * term, a no-match note once a search finished empty, and nothing while one
 * loads, fails or is offline (the palette shows those states itself). Page
 * wording only when the palette searches pages; an entity picker finds records.
 */
export function searchEmptyMessage(term: string, status: string, pages: boolean) {
  const what = pages ? "a page name, record name, or document number" : "a record name or number";
  if (!term) return `Type ${what}.`;
  if (status !== "ready") return "";
  return `${pages ? "No pages or records found" : "No records found"} · Try ${what}.`;
}
