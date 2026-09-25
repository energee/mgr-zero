/** Empty input must not silently become zero and release a reservation. */
export function replenishmentQuantityReady(skuId: string, qty: string) {
  return !!skuId && qty.trim() !== "" && Number.isFinite(Number(qty)) && Number(qty) >= 0;
}

/** The order's lines: only positive quantities. Blank or zero rows are left
 * out, so an all-zero table has nothing to submit rather than an empty `lines`
 * the command refuses (#447). */
export function replenishmentLines(suggestions: readonly { skuId: string }[], qtys: Record<string, string>) {
  return suggestions
    .filter((s) => Number(qtys[s.skuId] ?? 0) > 0)
    .map((s) => ({ skuId: s.skuId, qty: Number(qtys[s.skuId]) }));
}
