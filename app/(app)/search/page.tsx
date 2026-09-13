// app/(app)/search/page.tsx — Search: every permitted entity kind through one
// registered query (search_entities). Opened from the header's search control.
import { SearchPalette } from "@/components/mgr/search-palette";

export default function SearchPage() {
  return (
    <SearchPalette heading="Search" sub="SKUs, orders, invoices, lots, customers, POs, batches" />
  );
}
