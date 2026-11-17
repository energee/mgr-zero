// lib/mgr/guide-anchors.ts — which guide section explains each page (#1741).
// The page header's "?" and Me → Guide both read this one map, so they agree.
// A key is a route; a page below it inherits the entry, and `[id]` stands for
// any one segment. tests/guide-anchors.test.ts fails when an anchor is not a
// heading in its guide, or a top-level page has no entry.
const STAFF = "/docs/staff-guide";
const PORTAL = "/docs/portal-guide";

export const GUIDE_ANCHORS: Record<string, string> = {
  "/": `${STAFF}#navigation`,
  "/work": `${STAFF}#navigation`,
  "/work/deliveries": `${STAFF}#deliveries`,
  "/orders": `${STAFF}#orders`,
  "/orders/[id]/pick": `${STAFF}#pick-sheet`,
  "/pick": `${STAFF}#pick-sheet`,
  "/routes": `${STAFF}#deliveries`,
  "/transfers": `${STAFF}#transfers`,
  "/invoices": `${STAFF}#invoices`,
  "/customers": `${STAFF}#customers`,
  "/pricing": `${STAFF}#pricing`,
  "/beer": `${STAFF}#catalog`,
  "/catalog": `${STAFF}#catalog`,
  "/inventory": `${STAFF}#inventory`,
  "/locations": `${STAFF}#locations`,
  "/kegs": `${STAFF}#kegs`,
  "/menu": `${STAFF}#menu`,
  "/replenishment": `${STAFF}#replenishment`,
  "/taproom": `${STAFF}#taproom-counts`,
  "/taproom/board": `${STAFF}#tap-intervals`,
  "/taproom/variance": `${STAFF}#taproom-variance`,
  "/recipes": `${STAFF}#recipes`,
  "/batches": `${STAFF}#batches`,
  "/cellar": `${STAFF}#cellar`,
  "/packaging": `${STAFF}#packaging`,
  "/materials": `${STAFF}#purchasing`,
  "/vendors": `${STAFF}#purchasing`,
  "/purchase-orders": `${STAFF}#purchasing`,
  "/planning": `${STAFF}#purchasing`,
  "/compliance": `${STAFF}#compliance`,
  "/proposals": `${STAFF}#agent-proposals`,
  "/settings": `${STAFF}#settings`,
  "/settings/team": `${STAFF}#team`,
  "/settings/channels": `${STAFF}#channels`,
  "/settings/chat": `${STAFF}#slack`,
  "/settings/import": `${STAFF}#import`,
  "/settings/agents": `${STAFF}#agents`,
  "/settings/agents/activity": `${STAFF}#agent-activity`,
  "/more": `${STAFF}#navigation`,
  "/denied": `${STAFF}#no-access`,
  "/portal": `${PORTAL}#shop`,
  "/portal/coming-up": `${PORTAL}#shop`,
  "/portal/orders": `${PORTAL}#orders`,
  "/portal/invoices": `${PORTAL}#invoices`,
  "/portal/account": `${PORTAL}#account`,
};

const segments = (path: string) => path.split("/").filter(Boolean);

/** The guide link for a page: the entry whose route covers the most leading
 *  segments of `pathname`. Undefined when no entry covers it (docs, sign-in). */
export function guideHrefFor(pathname: string | null): string | undefined {
  // usePathname is null outside the App Router (static renders in tests).
  if (pathname === null) return undefined;
  const page = segments(pathname);
  let best: { length: number; href: string } | undefined;
  for (const [route, href] of Object.entries(GUIDE_ANCHORS)) {
    const key = segments(route);
    // "/" has no segments, so it would cover every page; it means Today only.
    if (key.length === 0 ? page.length > 0 : key.length > page.length) continue;
    if (!key.every((s, i) => s === "[id]" || s === page[i])) continue;
    if (!best || key.length > best.length) best = { length: key.length, href };
  }
  return best?.href;
}
