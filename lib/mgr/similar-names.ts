// lib/mgr/similar-names.ts — the near-duplicate name warning's shared types and links
// (docs/plans/near-duplicate-names.md). find_similar_names answers with these rows.

export type SimilarKind = "customer" | "vendor" | "material" | "brand";
export type SimilarName = { id: string; name: string };

/** Where a close name's record opens, and that page's name in the screen inventory.
 *  A material has no page of its own, so its name is plain text. */
export function similarNamePage(kind: SimilarKind, id: string): { href: string; screen: string } | undefined {
  if (kind === "customer") return { href: `/customers/${id}`, screen: "Customer detail" };
  if (kind === "vendor") return { href: `/vendors/${id}`, screen: "Vendor detail" };
  if (kind === "brand") return { href: `/catalog/brands/${id}`, screen: "Brand" };
  return undefined;
}
