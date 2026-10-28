// lib/mgr/new-po-view.ts — view-model for New PO, its per-line field errors,
// and what its Save draft still needs.
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
 *  and a cost rounds to cents. */
export function poLineErrors(line: { qty: number | string; cost: string }): { qty?: string; cost?: string } {
  return {
    ...(line.qty !== "" && !(Number(line.qty) > 0) ? { qty: "Enter a quantity above zero." } : {}),
    ...(line.cost !== "" && !(Number(line.cost) >= 0) ? { cost: "Enter a cost of zero or more." } : {}),
  };
}

/** What Save draft waits for: a vendor and, on every line, a material, a
 *  quantity above zero, and no negative unit cost. */
export function newPoReason({ vendor, lines }: { vendor: string; lines: { materialId?: string; qty: number | string; cost: string }[] }): string | null {
  const missing: string[] = [];
  if (!vendor) missing.push("a vendor");
  if (lines.some(line => !line.materialId)) missing.push("a material on each line");
  if (lines.some(line => !(Number(line.qty) > 0))) missing.push("a quantity above zero on each line");
  if (lines.some(line => poLineErrors(line).cost)) missing.push("a unit cost of zero or more");
  return submitReason(missing);
}
