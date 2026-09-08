// components/mgr/search-palette.tsx — the live Search sheet and Entity picker:
// one field over the registered search_entities query, results grouped by
// kind, arrow keys between matches, Enter or a tap opens the hit. `kinds`
// narrows it to a picker (SKUs only); `onPick` turns a hit into a choice
// instead of a navigation. The explorer's fixture palette stays palette.tsx.
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useBrewery } from "@/app/(app)/brewery-provider";
import { command } from "@/lib/commands/client";
import type { SearchHit, SearchKind } from "@/lib/commands/search";

const HEADING: Record<SearchKind, string> = { sku: "SKUs", order: "Orders", invoice: "Invoices", lot: "Lots", customer: "Customers", po: "Purchase orders", batch: "Batches" };

export function SearchPalette({ placeholder = "Search", kinds, onPick }: { placeholder?: string; kinds?: SearchKind[]; onPick?: (hit: SearchHit) => void }) {
  const breweryId = useBrewery();
  const router = useRouter();
  const [q, setQ] = useState("");
  // The answer remembers the term it answered; a newer term still loading keeps the last rows on screen.
  const [res, setRes] = useState<{ term: string; hits: SearchHit[] }>({ term: "", hits: [] });
  const term = q.trim();
  useEffect(() => {
    if (!term) return;
    let live = true;
    const t = setTimeout(() => {
      command(breweryId, "search_entities", { q: term, kinds })
        .then((data) => { if (live) setRes({ term, hits: data as SearchHit[] }); })
        .catch(() => { if (live) setRes({ term, hits: [] }); });
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [term, kinds, breweryId]);
  const hits = term ? res.hits : [];
  const loading = term !== res.term;
  const open = (hit: SearchHit) => (onPick ? onPick(hit) : router.push(hit.href));
  const groups = Map.groupBy(hits, (h) => h.kind);
  return (
    <Command label={placeholder} shouldFilter={false} className="h-auto">
      <CommandInput placeholder={placeholder} aria-label={placeholder} value={q} onValueChange={setQ} />
      <CommandList>
        {term && !loading && <CommandEmpty>No matches · change the term</CommandEmpty>}
        {[...groups].map(([kind, items]) => (
          <CommandGroup key={kind} heading={HEADING[kind]}>
            {items.map((h) => (
              <CommandItem key={`${h.kind}:${h.id}`} value={`${h.kind}:${h.id}`} onSelect={() => open(h)} className="min-h-12 cursor-pointer">
                <div className="flex min-w-0 flex-col text-left">
                  <div>{h.label}</div>
                  <span className="text-xs text-muted-foreground">{h.detail}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}
