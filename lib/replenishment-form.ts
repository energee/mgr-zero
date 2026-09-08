/** Empty input must not silently become zero and release a reservation. */
export function replenishmentQuantityReady(skuId: string, qty: string) {
  return !!skuId && qty.trim() !== "" && Number.isFinite(Number(qty)) && Number(qty) >= 0;
}
