// components/mgr/list-controls.tsx — the search, sort and filter strip above a
// list (docs/plans/list-filters.md). The URL holds the state and the server
// re-renders the narrowed list: search is E.search (shadcn Input) in a GET form
// that also replaces the URL a moment after typing stops; a scope is a labeled
// ScopePick whose options are links (Catalog's Sort and Category), sharing the
// search's row on desk and sitting side by side under it on a phone.
// The screen inventory passes no `path` and no option hrefs, so its box and picks stay inert.
// A client component because typing navigates.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { E } from "@/components/mgr/e";
import { ScopePick, type ScopeOption } from "@/components/mgr/scope-pick";
import { SEARCH_MAX } from "@/lib/mgr/list-params";

/** One labeled pick: its options, the selected value, and (live) the href each opens. */
export type ListScope = { label: string; value: string; options: ScopeOption[] };

/** How long typing pauses before the list re-runs its search. */
const SEARCH_PAUSE_MS = 300;

type ListSearch = { label: string; value: string; keep: Record<string, string>; path?: string };

/** The list at `path` with `keep` and the trimmed query; a blank query is left out. */
export function searchHref(path: string, keep: Record<string, string>, q: string) {
  const query = new URLSearchParams(keep);
  if (q.trim()) query.set("q", q.trim());
  return `${path}?${query}`;
}

export function ListControls({ search, scopes = [] }: {
  /** `keep` carries the other params through a search, so it keeps the sort.
   *  `path` is the list's route; a live page passes it so typing searches.
   *  The inventory leaves it out (useRouter throws outside the app router). */
  search: ListSearch;
  scopes?: ListScope[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        {search.path ? <LiveSearch search={search} path={search.path} /> : <SearchForm search={search} />}
        {/* On a phone a pick is as wide as its chosen label (at least 9rem), so a
            long category wraps onto its own row instead of clipping beside Sort. */}
        {scopes.map(scope => (
          <div key={scope.label} className="min-w-36 max-w-full flex-auto lg:w-48 lg:flex-none">
            <ScopePick label={scope.label} value={scope.value} options={scope.options} />
          </div>
        ))}
      </div>
      {/* The no-match copy says "Clear the search"; this is how. The other params stay. */}
      {search.value && <Link href={searchHref("", search.keep, "")} className="w-fit text-sm text-muted-foreground underline">Clear search</Link>}
    </div>
  );
}

/** The GET form: Enter submits it, and it works before scripts load. */
function SearchForm({ search, onType }: { search: ListSearch; onType?: (q: string) => void }) {
  return <form method="get" role="search" className="basis-full lg:basis-0 lg:grow">
    {Object.entries(search.keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
    {E.search(search.label, { name: "q", defaultValue: search.value, maxLength: SEARCH_MAX, onChange: onType && (event => onType(event.target.value)) })}
  </form>;
}

/** Replaces the URL once typing pauses, so the list narrows without Enter. */
function LiveSearch({ search, path }: { search: ListSearch; path: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const type = (q: string) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => router.replace(searchHref(path, search.keep, q), { scroll: false }), SEARCH_PAUSE_MS);
  };
  return <SearchForm search={search} onType={type} />;
}
