// app/(app)/search/page.tsx — Search: every permitted entity kind through one
// registered query (search_entities). Opened from the header's search control.
import { E } from "@/components/mgr/e";
import { SearchPalette } from "@/components/mgr/search-palette";

export default function SearchPage() {
  return (
    <>
      {E.hd("Search", "SKUs, orders, invoices, lots, customers, POs, batches")}
      <SearchPalette />
    </>
  );
}
