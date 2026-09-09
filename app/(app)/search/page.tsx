// app/(app)/search/page.tsx — Search: every permitted entity kind through one
// registered query (search_entities). Opened from the header's search control.
import { SearchPalette } from "@/components/mgr/search-palette";
import { SearchView } from "@/components/mgr/views/search";
import { toSearchViewProps } from "@/lib/mgr/search-view";

export default function SearchPage() {
  return (
    <SearchView
      model={toSearchViewProps({
        placeholder: "Search",
        groups: [],
        heading: "Search",
        sub: "SKUs, orders, invoices, lots, customers, POs, batches",
      })}
      palette={<SearchPalette />}
    />
  );
}
