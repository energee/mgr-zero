import { redirect } from "next/navigation";

/** SKU creation belongs to a saved brand's Sells as, not a separate form. */
export default function CatalogSkusPage() {
  redirect("/catalog");
}
