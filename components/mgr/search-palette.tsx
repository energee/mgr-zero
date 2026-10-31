// components/mgr/search-palette.tsx — the live Search sheet: role-visible pages
// and registered search_entities results, grouped by kind. Arrow keys move
// between matches; Enter or a tap opens the destination. SearchView also draws
// the explorer's fixture palette.
"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CommandForm } from "@/components/mgr/command-form";
import { Icon } from "@/components/mgr/icon";
import { SearchView, type SearchViewModel } from "@/components/mgr/views/search";
import { useBrewery } from "@/lib/brewery-provider";
import { command } from "@/lib/commands/client";
import type { StaffRole } from "@/lib/commands/registry";
import type { SearchHit, SearchKind } from "@/lib/commands/search";
import { searchCacheKey, searchDestinations, searchEmptyMessage, searchLoading, type SearchStatus } from "@/lib/mgr/search-palette-state";

const HEADING: Record<SearchKind, string> = {
  sku: "SKUs", order: "Orders", invoice: "Invoices", material_lot: "Ingredient lots", lot: "Lots", customer: "Customers", po: "Purchase orders", batch: "Batches",
  packaging_run: "Packaging runs", transfer: "Transfers", route: "Routes", recipe: "Recipes", vessel: "Vessels", vendor: "Vendors", ship_to: "Ship-tos",
  material: "Materials", keg_pool: "Keg pools", bin: "Bins", license: "Licenses", water_profile: "Water profiles",
};

const SearchCache = createContext<Map<string, SearchHit[]> | null>(null);

// Cache only in this mounted staff session; the layout keys it by actor, brewery,
// and role. Sign-out, account switching, and reload discard the previous rows.
export function SearchCacheProvider({ children }: { children: React.ReactNode }) {
  const [cache] = useState(() => new Map<string, SearchHit[]>());
  return <SearchCache.Provider value={cache}>{children}</SearchCache.Provider>;
}

export function SearchSheet({ roles }: { roles: readonly StaffRole[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const breweryId = useBrewery();
  const cache = useContext(SearchCache)!;
  const router = useRouter();
  const [q, setQ] = useState("");
  // Associate results with their term so an in-flight query cannot show old matches.
  const [res, setRes] = useState<{ term: string; hits: SearchHit[] }>({ term: "", hits: [] });
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [error, setError] = useState("");
  const term = q.trim();
  const recentKey = `mgr-search-recent:${breweryId}`;
  const [recent, setRecent] = useState<SearchHit[]>(() => cache.get(recentKey) ?? []);
  const changeOpen = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setQ("");
      setRes({ term: "", hits: [] });
      setStatus("idle");
      setError("");
    }
  };
  const navigate = (href: string) => {
    changeOpen(false);
    router.push(href);
  };
  useEffect(() => {
    if (!term) return;
    let live = true;
    const t = setTimeout(() => {
      setStatus("loading");
      setError("");
      const cacheKey = searchCacheKey(breweryId, term);
      command(breweryId, "search_entities", { q: term })
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
  }, [term, breweryId, cache]);
  const loading = searchLoading(term, res.term, status);
  const currentStatus = !term ? "idle" : loading ? "loading" : status;
  const hits = loading || currentStatus === "error" ? [] : res.hits;
  const open = (hit: SearchHit) => {
    const next = [hit, ...recent.filter((r) => r.kind !== hit.kind || r.id !== hit.id)].slice(0, 5);
    cache.set(recentKey, next);
    setRecent(next);
    navigate(hit.href);
  };
  const pages = searchDestinations(roles, term);
  const shown = !term ? recent : hits;
  const byKey = new Map(shown.map(hit => [`${hit.kind}:${hit.id}`, hit]));
  const groups = Map.groupBy(shown, hit => !term ? "recent" : hit.kind);
  const viewGroups: SearchViewModel["groups"] = Array.from(groups, ([kind, items]) => ({
    heading: kind === "recent" ? "Recent" : HEADING[kind],
    items: items.map(hit => [hit.label, hit.detail, `${hit.kind}:${hit.id}`]),
  }));
  // NavItem.about is optional in the type, so a page with no line renders an
  // empty detail; every STAFF_NAV entry has one (tests/mgr-nav.test.ts enforces it).
  if (pages.length) viewGroups.unshift({
    heading: "Pages",
    items: pages.map(page => [page.label, page.about ?? "", `page:${page.href}`]),
  });
  const before = <>
    {loading && <div role="status" aria-label="Loading results" className="space-y-2 p-3">{[1, 2, 3].map(n => <Skeleton key={n} className="h-12" />)}</div>}
    {currentStatus === "offline" && <p role="status" className="px-3 py-2 text-sm text-muted-foreground">Offline · {hits.length ? "cached matches only" : "no cached matches"}</p>}
    {currentStatus === "error" && <p role="alert" className="px-3 py-2 text-sm text-destructive">Search failed · {error}</p>}
  </>;
  return <CommandForm open={isOpen} onOpenChange={changeOpen} title="Search" trigger={<Button variant="ghost" size="sm" aria-label="Search"><Icon icon={Search01Icon} />Search</Button>}>
    <SearchView model={{ placeholder: "Search", groups: viewGroups }}
    value={q} onValueChange={setQ} shouldFilter={false} before={before}
    emptyMessage={searchEmptyMessage(term, currentStatus)}
    onSelect={key => {
      const page = pages.find(page => `page:${page.href}` === key);
      if (page) { navigate(page.href); return; }
      const hit = byKey.get(key); if (hit) open(hit);
    }} />
  </CommandForm>;
}
