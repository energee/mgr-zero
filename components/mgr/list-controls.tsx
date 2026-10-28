// components/mgr/list-controls.tsx — the search, sort and filter strip above a
// list (docs/plans/list-filters.md). The URL holds the state (a GET form, or
// a pick that opens its option's link) and the server re-renders the narrowed list:
// search is E.search (shadcn Input); a scope is a labeled ScopePick whose
// options are links (Catalog's Sort and Category), sharing the search's row on
// desk and sitting side by side under it on a phone.
// Options without hrefs draw inert picks, which is how the screen inventory shows them.
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { ScopePick, type ScopeOption } from "@/components/mgr/scope-pick";
import { SEARCH_MAX } from "@/lib/mgr/list-params";

/** One labeled pick: its options, the selected value, and (live) the href each opens. */
export type ListScope = { label: string; value: string; options: ScopeOption[] };

export function ListControls({ search, scopes = [] }: {
  /** `keep` carries the other params through the GET form, so a search keeps the sort. */
  search: { label: string; value: string; keep: Record<string, string> };
  scopes?: ListScope[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <form method="get" role="search" className="basis-full lg:basis-0 lg:grow">
          {Object.entries(search.keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {E.search(search.label, { name: "q", defaultValue: search.value, maxLength: SEARCH_MAX })}
        </form>
        {/* On a phone a pick is as wide as its chosen label (at least 9rem), so a
            long category wraps onto its own row instead of clipping beside Sort. */}
        {scopes.map(scope => (
          <div key={scope.label} className="min-w-36 max-w-full flex-auto lg:w-48 lg:flex-none">
            <ScopePick label={scope.label} value={scope.value} options={scope.options} />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Press Enter to search</p>
      {/* The no-match copy says "Clear the search"; this is how. The other params stay. */}
      {search.value && <Link href={`?${new URLSearchParams(search.keep)}`} className="w-fit text-sm text-muted-foreground underline">Clear search</Link>}
    </div>
  );
}
