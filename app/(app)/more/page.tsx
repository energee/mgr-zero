// app/(app)/more/page.tsx — More: setup and desk review, never standing work.
// The rows are the role's More entries from the navigation manifest
// (lib/mgr/nav.ts), so a hidden entry leaves no gap and a planned one never
// appears; the phone More tab lands here instead of on the first child.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { navFor, shippedNav, STAFF_NAV } from "@/lib/mgr/nav";

export default async function MorePage() {
  const brewery = await getActiveBrewery();
  const items = navFor(shippedNav(STAFF_NAV), brewery.role).find((t) => t.label === "More")?.children ?? [];
  return (
    <>
      {E.hd("More")}
      {items.map((c) => <div key={c.href}>{E.nav(c.label, c.about ?? "", "", undefined, c.href)}</div>)}
    </>
  );
}
