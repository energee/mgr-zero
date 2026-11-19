// tests/similar-names-view.test.ts — the near-duplicate name warning as drawn
// (docs/plans/near-duplicate-names.md): the "Similar:" line, where each name links,
// and that an error under the field replaces it.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { E } from "@/components/mgr/e";
import { SimilarNamesNote } from "@/components/mgr/similar-names";
import { VendorView } from "@/components/mgr/views/vendor";
import { similarNamePage } from "@/lib/mgr/similar-names";

const note = (kind: "customer" | "vendor" | "material" | "brand", names: string[]) =>
  createElement(SimilarNamesNote, { kind, matches: names.map((name, index) => ({ id: `id-${index}`, name })) });

describe("the near-duplicate name warning", () => {
  it("lists the close names in order, each linking to its record", () => {
    const html = renderToStaticMarkup(note("vendor", ["Hartwell Distributing", "Hartwell Dist."]));
    expect(html).toContain('role="status"');
    expect(html).toMatch(/Similar: <a[^>]*href="\/vendors\/id-0"[^>]*>Hartwell Distributing<\/a>, <a[^>]*href="\/vendors\/id-1"[^>]*>Hartwell Dist\.<\/a>/);
  });

  it("links customers and brands to their pages and leaves a material as plain text", () => {
    expect(similarNamePage("customer", "c")).toEqual({ href: "/customers/c", screen: "Customer detail" });
    expect(similarNamePage("brand", "b")).toEqual({ href: "/catalog/brands/b", screen: "Brand" });
    const html = renderToStaticMarkup(note("material", ["Citra T-90"]));
    expect(html).toContain("Similar: Citra T-90");
    expect(html).not.toContain("<a");
  });

  it("shows under a text field, and gives way to an error", () => {
    const warning = createElement("p", null, "Similar: Joes Bar");
    expect(renderToStaticMarkup(E.edit("Name", "Joe's Bar", "text", undefined, { id: "n", note: warning }))).toContain("Similar: Joes Bar");
    const withError = renderToStaticMarkup(E.edit("Name", "", "text", undefined, { id: "n", note: warning, error: "Enter a name." }));
    expect(withError).toContain("Enter a name.");
    expect(withError).not.toContain("Similar: Joes Bar");
  });

  it("is drawn by the vendor form under Vendor name", () => {
    const model = { name: "Hartwell Distributing, Inc.", email: "", phone: "", terms: "Net 30", termsOptions: ["Net 30"], leadDays: "", active: null };
    const html = renderToStaticMarkup(createElement(VendorView, { model, nameNote: note("vendor", ["Hartwell Distributing"]) }));
    expect(html).toContain("Similar: ");
    expect(html).toContain(">Hartwell Distributing</a>");
  });
});
