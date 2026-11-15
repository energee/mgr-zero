// Pins the #1606 rule: a row link that names a record is not prefetched, so a
// visible row runs no record read; links without a record id keep Next's default.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rowLinkPrefetch } from "@/lib/mgr/row-link-prefetch";

const ID = "53d50a9f-2c04-4cdc-a90c-f58718605d7a";

describe("rowLinkPrefetch", () => {
  it.each([
    `/orders/${ID}`,
    `/orders/${ID}/ship`,
    `/routes/${ID}`,
    `/portal?reorder=${ID}`,
    `/orders?order=${ID}`,
    `/cellar/vessels/${ID}`,
  ])("does not prefetch the record link %s", (href) => {
    expect(rowLinkPrefetch(href)).toBe(false);
  });

  it.each(["/", "/work", "/pick", "/orders", "/settings/water", "/compliance/2026-09", "#"])(
    "keeps the default for %s, which names no record",
    (href) => {
      expect(rowLinkPrefetch(href)).toBeUndefined();
    },
  );

  it.each([
    "components/mgr/e.tsx",
    "components/mgr/views/record-table.tsx",
    "components/mgr/views/portal-orders.tsx",
    "components/mgr/views/lot-trace.tsx",
    "components/mgr/order-sheet-link.tsx",
  ])("%s passes its row links through the rule", (file) => {
    expect(readFileSync(file, "utf8")).toContain("prefetch={rowLinkPrefetch(");
  });

  // docs/plans/hosted-latency.md F4: a vessel tile's link had no rule, so
  // opening Cellar requested every vessel page.
  it("every link E draws goes through the rule", () => {
    const links = readFileSync("components/mgr/e.tsx", "utf8").split("\n").filter(line => line.includes("<Link "));
    expect(links.filter(line => !line.includes("prefetch={rowLinkPrefetch("))).toEqual([]);
  });
});
