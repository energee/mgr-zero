// #909 streamline items 1 and 4: rows are unboxed list entries, and a vessel
// tile's fill is a real progressbar. Reads rendered markup, not source text;
// the hairline between rows is CSS, so the look is checked in the browser.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { E } from "@/components/mgr/e";

/** The opening tag of the outermost element a helper renders. */
const rootTag = (html: string) => html.match(/^<[^>]+>/)?.[0] ?? "";

describe("unboxed rows", () => {
  it.each([
    ["E.row", E.row("YCH", "hops · 1 active contract", E.act("Edit"))],
    ["E.nav", E.nav("Materials", "12 materials")],
    ["E.nav with href", E.nav("Materials", "12 materials", "", undefined, "/materials")],
    ["E.gated", E.gated("Email delivery status")],
    ["E.line", E.line("Citra", "hops", "10 lb", "", E.edit("Lot", ""))],
  ])("%s draws no box and marks its outer element as a row", (_, row) => {
    const html = renderToStaticMarkup(row);
    expect(html).not.toContain('data-variant="outline"');
    expect(html).toContain('data-slot="item"');
    // The sibling rule between consecutive rows keys on this marker, so it
    // must sit on the element that is the neighbour: the link, when there is one.
    expect(rootTag(html)).toContain("data-row");
  });
});

describe("vessel tile fill", () => {
  const tile = (fill?: number) => renderToStaticMarkup(E.tiles([["FV1", "Pils · 10 / 20 bbl", "6.2 °P", 0, fill, "/cellar/fv1"]], "c2"));

  it("is a labelled progressbar carrying its value", () => {
    const html = tile(50);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Fill"');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain('aria-valuemax="100"');
  });

  it("tops out at full when a vessel reads over capacity", () => {
    expect(tile(125)).toContain('aria-valuenow="100"');
  });

  it("draws no bar for a tile without a fill", () => {
    expect(tile()).not.toContain("progressbar");
  });
});
