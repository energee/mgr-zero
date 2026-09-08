// components/mgr/search-palette.tsx — the live Search sheet and Entity picker:
// one field over the registered search_entities query, results grouped by
// kind, arrow keys between matches, Enter or a tap opens the hit. `kinds`
// narrows it to a picker (SKUs only); `onPick` turns a hit into a choice
// instead of a navigation. The explorer's fixture palette stays palette.tsx.
"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { CommandForm } from "@/components/mgr/command-form";
import { Icon } from "@/components/mgr/icon";
import { useBrewery } from "@/app/(app)/brewery-provider";
import { command } from "@/lib/commands/client";
import type { SearchHit, SearchKind } from "@/lib/commands/search";
import { excludeSeen, restrictToOptions, searchCacheKey, searchLoading } from "@/lib/mgr/search-palette-state";

const HEADING: Record<SearchKind, string> = { sku: "SKUs", order: "Orders", invoice: "Invoices", lot: "Lots", customer: "Customers", po: "Purchase orders", batch: "Batches" };

const SearchCache = createContext<Map<string, SearchHit[]> | null>(null);

// Cache only in this mounted staff session; the layout keys it by actor, brewery,
// and role. Sign-out, account switching, and reload discard the previous rows.
export function SearchCacheProvider({ children }: { children: React.ReactNode }) {
  const [cache] = useState(() => new Map<string, SearchHit[]>());
  return <SearchCache.Provider value={cache}>{children}</SearchCache.Provider>;
}

type SearchStatus = "idle" | "loading" | "ready" | "error" | "offline";

export function SearchPalette({ placeholder = "Search", kinds, onPick, initialHits }: { placeholder?: string; kinds?: SearchKind[]; onPick?: (hit: SearchHit) => void; initialHits?: SearchHit[] }) {
  const breweryId = useBrewery();
  const cache = useContext(SearchCache)!;
  const router = useRouter();
  const [q, setQ] = useState("");
  // Associate results with their term so an in-flight query cannot show old matches.
  const [res, setRes] = useState<{ term: string; hits: SearchHit[] }>({ term: "", hits: [] });
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [error, setError] = useState("");
  const term = q.trim();
  // kinds is compared by identity, so an inline array from a caller would re-fire
  // the debounce every render; the effect depends on its content instead.
  const kindKey = kinds?.join(",") ?? "";
  const recentKey = `mgr-search-recent:${breweryId}:${kindKey || "all"}`;
  const [recent, setRecent] = useState<SearchHit[]>(() => cache.get(recentKey) ?? []);
  useEffect(() => {
    if (!term) return;
    let live = true;
    const t = setTimeout(() => {
      setStatus("loading");
      setError("");
      const kinds = kindKey ? kindKey.split(",") as SearchKind[] : undefined;
      const cacheKey = searchCacheKey(breweryId, kinds, term);
      command(breweryId, "search_entities", { q: term, kinds })
        .then((data) => {
          if (!live) return;
          const hits = data as SearchHit[];
          cache.set(cacheKey, hits);
          setRes({ term, hits });
          setStatus("ready");
        })
        .catch((err) => {
          if (!live) return;
          const hits = cache.get(cacheKey) ?? [];
          setRes({ term, hits });
          if (!navigator.onLine) setStatus("offline");
          else { setStatus("error"); setError(err instanceof Error ? err.message : "Search failed"); }
        });
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [term, kindKey, breweryId, cache]);
  const loading = searchLoading(term, res.term, status);
  const currentStatus = !term ? "idle" : loading ? "loading" : status;
  const visibleRecent = restrictToOptions(recent, initialHits);
  const hits = loading || currentStatus === "error" ? [] : term
    ? restrictToOptions(res.hits, initialHits)
    : excludeSeen(initialHits ?? [], visibleRecent);
  const open = (hit: SearchHit) => {
    const next = [hit, ...recent.filter((r) => r.kind !== hit.kind || r.id !== hit.id)].slice(0, 5);
    cache.set(recentKey, next);
    setRecent(next);
    if (onPick) onPick(hit);
    else router.push(hit.href);
  };
  const groups = Map.groupBy(hits, (h) => h.kind);
  return (
    <Command label={placeholder} shouldFilter={false} className="h-auto">
      <CommandInput placeholder={placeholder} aria-label={placeholder} value={q} onValueChange={setQ} />
      <CommandList>
        {!term && visibleRecent.length > 0 && (
          <CommandGroup heading="Recent">
            {visibleRecent.map((h) => <SearchItem key={`recent:${h.kind}:${h.id}`} hit={h} onSelect={open} />)}
          </CommandGroup>
        )}
        {loading && <div role="status" aria-label="Loading results" className="space-y-2 p-3">{[1, 2, 3].map((n) => <Skeleton key={n} className="h-12" />)}</div>}
        {currentStatus === "offline" && <p role="status" className="px-3 py-2 text-sm text-muted-foreground">Offline · {hits.length ? "cached matches only" : "no cached matches"}</p>}
        {currentStatus === "error" && <p role="alert" className="px-3 py-2 text-sm text-destructive">Search failed · {error}</p>}
        {term && currentStatus === "ready" && hits.length === 0 && <CommandEmpty>No matches · change the term</CommandEmpty>}
        {[...groups].map(([kind, items]) => (
          <CommandGroup key={kind} heading={HEADING[kind]}>
            {items.map((h) => <SearchItem key={`${h.kind}:${h.id}`} hit={h} onSelect={open} />)}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}

function SearchItem({ hit, onSelect }: { hit: SearchHit; onSelect: (hit: SearchHit) => void }) {
  return (
    <CommandItem value={`${hit.kind}:${hit.id}`} onSelect={() => onSelect(hit)} className="min-h-12 cursor-pointer">
      <div className="flex min-w-0 flex-col text-left"><div>{hit.label}</div><span className="text-xs text-muted-foreground">{hit.detail}</span></div>
    </CommandItem>
  );
}

export function SearchSheet() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return <CommandForm open={open} onOpenChange={setOpen} title="Search" trigger={<Button variant="ghost" size="sm" aria-label="Search"><Icon icon={Search01Icon} />Search</Button>}><SearchPalette onPick={(hit) => { setOpen(false); router.push(hit.href); }} /></CommandForm>;
}

export function SkuPicker({ value, options, onChange, label = "Select SKU" }: { value: string; options: { id: string; label: string }[]; onChange: (id: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);
  const hits = useMemo<SearchHit[]>(
    () => options.map((option) => ({ kind: "sku", id: option.id, label: option.label, detail: "SKU", href: "/catalog", exact: false })),
    [options],
  );
  return (
    <CommandForm open={open} onOpenChange={setOpen} title="Select SKU" trigger={<Button type="button" variant="outline" className="min-h-9 flex-1 justify-start font-normal">{selected?.label ?? label}</Button>}>
      <SearchPalette placeholder="Search SKUs" kinds={["sku"]} initialHits={hits} onPick={(hit) => { onChange(hit.id); setOpen(false); }} />
    </CommandForm>
  );
}
