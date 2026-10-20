// components/mgr/list-controls.tsx — the search, sort and filter strip above a
// list (docs/plans/list-filters.md). Every control is a plain link or GET form,
// so the URL holds the state and the server re-renders the narrowed list:
// search is E.search (shadcn Input); a scope is a labeled ScopePick whose
// options are links (Catalog's Sort and Category), sharing the search's row on
// desk and sitting side by side under it on a phone; a row is TabBar (shadcn Tabs).
// Options or rows without hrefs draw inert controls, which is how the screen inventory shows them.
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { TabBar } from "@/components/mgr/qty";
import { ScopePick, type ScopeOption } from "@/components/mgr/scope-pick";

/** One row of tabs: option labels, the selected one, and (live) the href each selects. */
export type ListControlRow = { label: string; names: string[]; on: number; hrefs?: Record<string, string> };

/** One labeled pick: its options, the selected value, and (live) the href each opens. */
export type ListScope = { label: string; value: string; options: ScopeOption[] };

export function ListControls({ search, scopes = [], rows }: {
  /** `keep` carries the other params through the GET form, so a search keeps the sort. */
  search: { label: string; value: string; keep: Record<string, string> };
  scopes?: ListScope[];
  rows: ListControlRow[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <form method="get" role="search" className="basis-full md:basis-0 md:grow">
          {Object.entries(search.keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {E.search(search.label, { name: "q", defaultValue: search.value })}
        </form>
        {scopes.map(scope => (
          <div key={scope.label} className="min-w-0 flex-1 md:w-48 md:flex-none">
            <ScopePick label={scope.label} value={scope.value} options={scope.options} />
          </div>
        ))}
      </div>
      {/* The no-match copy says "Clear the search"; this is how. The other params stay. */}
      {search.value && <Link href={`?${new URLSearchParams(search.keep)}`} className="w-fit text-sm text-muted-foreground underline">Clear search</Link>}
      {rows.map(row => (
        <nav key={row.label} aria-label={row.label} className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-xs text-muted-foreground">{row.label}</span>
          <TabBar names={row.names} on={row.on} hrefs={row.hrefs} cls="w-full justify-start overflow-x-auto md:w-fit" />
        </nav>
      ))}
    </div>
  );
}
