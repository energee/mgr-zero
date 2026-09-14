// lib/keg-aging.ts — how old are the kegs a customer still holds. The keg
// ledger stores counts, not serials, so a return cannot name the keg it
// closes; returns (and losses) retire the oldest shipment first — FIFO,
// decided 2026-09-13 for issue #278. Pure; get_keg_report feeds it the ledger.
export type KegLedgerEvent = { customer_id: string | null; pool_id: string; keg_size: string; qty: number; reason: string; at: string };
export type AgedKeg = { customer_id: string; pool_id: string; keg_size: string; qty: number; shipped_at: string; days: number };

export function kegAging(events: KegLedgerEvent[], now: Date): AgedKeg[] {
  type Queue = { customer_id: string; pool_id: string; keg_size: string; open: { at: string; qty: number }[] };
  const queues = new Map<string, Queue>();
  for (const e of events.filter((e) => e.customer_id).sort((a, b) => a.at.localeCompare(b.at))) {
    const key = `${e.customer_id}|${e.pool_id}|${e.keg_size}`;
    const q = queues.get(key) ?? { customer_id: e.customer_id!, pool_id: e.pool_id, keg_size: e.keg_size, open: [] };
    if (e.reason === "shipped") q.open.push({ at: e.at, qty: e.qty });
    else if (e.reason === "returned" || e.reason === "lost") {
      let left = e.qty;
      while (left > 0 && q.open.length) {
        const take = Math.min(left, q.open[0].qty);
        q.open[0].qty -= take; left -= take;
        if (q.open[0].qty === 0) q.open.shift();
      }
    }
    queues.set(key, q);
  }
  return [...queues.values()].flatMap(({ open, ...who }) =>
    open.map((s) => ({ ...who, qty: s.qty, shipped_at: s.at, days: Math.floor((now.getTime() - new Date(s.at).getTime()) / 86_400_000) })));
}
