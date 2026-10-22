// lib/replenishment-form.ts — the pure rules behind the Replenishment page's
// forms: what Set taproom par / Set standing allocation and Create
// replenishment order still need, and which order lines are sent.
import { submitReason } from "@/lib/mgr/submit-reason";

/** Par and standing allocation need a SKU and a finite quantity of zero or
 *  more. Empty input must not silently become zero and release a reservation. */
export function replenishmentQuantityReason(skuId: string, qty: string): string | null {
  const missing: string[] = [];
  if (!skuId) missing.push("a SKU");
  if (!(qty.trim() !== "" && Number.isFinite(Number(qty)) && Number(qty) >= 0)) missing.push("a quantity of zero or more");
  return submitReason(missing);
}

/** A replenishment order needs a source warehouse and at least one positive line. */
export function replenishReason(fromLocationId: string, lines: ReturnType<typeof replenishmentLines>): string | null {
  const missing: string[] = [];
  if (!fromLocationId) missing.push("a warehouse to send from");
  if (lines.length === 0) missing.push("a transfer quantity above zero");
  return submitReason(missing);
}

/** The order's lines: only positive quantities. Blank or zero rows are left
 * out, so an all-zero table has nothing to submit rather than an empty `lines`
 * the command refuses (#447). */
export function replenishmentLines(suggestions: readonly { skuId: string }[], qtys: Record<string, string>) {
  return suggestions
    .filter((s) => Number(qtys[s.skuId] ?? 0) > 0)
    .map((s) => ({ skuId: s.skuId, qty: Number(qtys[s.skuId]) }));
}
