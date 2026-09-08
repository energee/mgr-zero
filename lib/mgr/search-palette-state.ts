import type { SearchHit, SearchKind } from "@/lib/commands/search";

export function searchCacheKey(breweryId: string, kinds: SearchKind[] | undefined, term: string) {
  return `mgr-search:${breweryId}:${kinds?.join(",") || "all"}:${term.trim().toLowerCase()}`;
}

export function searchLoading(term: string, answeredTerm: string, status: string) {
  return term !== "" && (status === "loading" || term !== answeredTerm);
}

export function pickerHits(hits: SearchHit[], options?: SearchHit[], recent: SearchHit[] = []) {
  return hits.filter((hit) =>
    (!options || options.some((option) => option.kind === hit.kind && option.id === hit.id)) &&
    !recent.some((item) => item.kind === hit.kind && item.id === hit.id));
}
