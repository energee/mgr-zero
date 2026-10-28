// lib/mgr/new-po-view.ts — view-model for New PO, its per-line field errors,
// and what its Save draft still needs.
import { toCents } from "@/lib/mgr/money";
import { numberNotationError } from "@/lib/mgr/quantity-input";
import { submitReason } from "@/lib/mgr/submit-reason";
import { isPastDay } from "@/lib/date-format";

export type NewPoLineView = {
  key: string;
  title: string;
  detail: string;
  qty: number | string;
  materialId?: string;
  cost: string;
  lot?: string;
};

export type NewPoViewModel = {
  backHref?: string;
  /** Where vendors and materials are made, on a live page; the inventory leaves them inert. */
  vendorsHref?: string;
  materialsHref?: string;
  vendor: string;
  vendors?: { id: string; name: string }[];
  materials?: { id: string; name: string; purchase_uom: string; lot_tracked: boolean }[];
  expected: string;
  /** The brewery's day (breweryDate), so a past Expected date warns; the inventory leaves it out. */
  today?: string;
  lines: NewPoLineView[];
};

/** A past Expected date still saves; the draft says so rather than saving it silently (#1489). */
export function pastExpectedWarning(date: string, today?: string): string | undefined {
  return isPastDay(date, today) ? "This expected date is in the past for your brewery. You can still save the PO." : undefined;
}

/** A typed value the PO cannot take, shown under its own field. A blank field
 *  is not an error: the quantity is then missing (newPoReason), and the cost
 *  is optional. Decimals stay valid: quantities are fractional purchase units
 *  and a cost rounds to cents. The maximums are the columns' storage bounds:
 *  qty_ordered and qty_committed are numeric(14,4), unit cost is int cents. */
export function poLineErrors(line: { qty: number | string; cost: string }): { qty?: string; cost?: string } {
  const qty = Number(line.qty);
  const cost = Number(line.cost);
  let qtyError: string | undefined;
  if (line.qty !== "" && !(qty > 0)) qtyError = "Enter a quantity above zero.";
  else if (qty > 9_999_999_999.9999) qtyError = "Enter a quantity no greater than 9,999,999,999.9999.";
  let costError: string | undefined;
  if (line.cost !== "" && !(cost >= 0)) costError = "Enter a cost of zero or more.";
  else if ((toCents(line.cost) ?? 0) > 2_147_483_647) costError = "Enter a cost no greater than $21,474,836.47.";
  return { ...(qtyError && { qty: qtyError }), ...(costError && { cost: costError }) };
}

/** What Save draft waits for: a vendor and, on every line, a material, a
 *  quantity above zero, a unit cost of zero or more, both within their
 *  column limits and typed without exponent notation. */
export function newPoReason({ vendor, lines }: { vendor: string; lines: { materialId?: string; qty: number | string; cost: string }[] }): string | null {
  const missing: string[] = [];
  if (!vendor) missing.push("a vendor");
  if (lines.some(line => !line.materialId)) missing.push("a material on each line");
  if (lines.some(line => numberNotationError(String(line.qty)) || numberNotationError(line.cost))) missing.push("decimal numbers, not exponent notation");
  if (lines.some(line => !(Number(line.qty) > 0))) missing.push("a quantity above zero on each line");
  else if (lines.some(line => poLineErrors(line).qty)) missing.push("a quantity no greater than 9,999,999,999.9999 on each line");
  if (lines.some(line => poLineErrors(line).cost)) missing.push("a unit cost from $0 to $21,474,836.47");
  return submitReason(missing);
}

/** The material picker's order once a vendor is chosen: materials whose
 *  default vendor it is come first, then the rest, each in the given
 *  (alphabetical) order. Nothing is hidden: any material may go on any PO. */
export function vendorMaterialsFirst<M extends { default_vendor_id: string | null }>(materials: M[], vendorId: string): M[] {
  if (!vendorId) return materials;
  return [...materials.filter((m) => m.default_vendor_id === vendorId), ...materials.filter((m) => m.default_vendor_id !== vendorId)];
}

export type PoContract = { id: string; vendor_id: string; material_id: string; unit_cost_cents: number | null; starts_on: string | null; ends_on: string | null };

/** The contract a New PO line draws down and takes its cost from: the one
 *  contract for this vendor and material in force on `today` (open ends
 *  count). Null when none is, or when several are and the line must not guess. */
export function onlyActiveContract<C extends PoContract>(contracts: C[], vendorId: string, materialId: string, today: string): C | null {
  const active = contracts.filter((c) => c.vendor_id === vendorId && c.material_id === materialId
    && (c.starts_on == null || c.starts_on <= today) && (c.ends_on == null || c.ends_on >= today));
  return active.length === 1 ? active[0] : null;
}
