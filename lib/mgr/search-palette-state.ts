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
