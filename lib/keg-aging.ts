// lib/keg-aging.ts — how old are the kegs a customer still holds. The keg
// ledger stores counts, not serials, so a return cannot name the keg it
// closes; returns (and losses) retire the oldest shipment first — FIFO,
// decided 2026-09-13 for issue #278. Pure; get_keg_report feeds it the ledger.
export type KegLedgerEvent = { customer_id: string | null; pool_id: string; keg_size: string; qty: number; reason: string; at: string };
export type AgedKeg = { customer_id: string; pool_id: string; keg_size: string; qty: number; shipped_at: string; days: number };

export function kegAging(events: KegLedgerEvent[], now: Date): AgedKeg[] {
  const queues = new Map<string, { at: string; qty: number }[]>();
  const sorted = events.filter((e) => e.customer_id).sort((a, b) => a.at.localeCompare(b.at));
  for (const e of sorted) {
    const key = `${e.customer_id}|${e.pool_id}|${e.keg_size}`;
    const q = queues.get(key) ?? [];
    if (e.reason === "shipped") q.push({ at: e.at, qty: e.qty });
    else if (e.reason === "returned" || e.reason === "lost") {
      let left = e.qty;
      while (left > 0 && q.length) {
        const take = Math.min(left, q[0].qty);
        q[0].qty -= take; left -= take;
        if (q[0].qty === 0) q.shift();
      }
    }
    queues.set(key, q);
  }
  const out: AgedKeg[] = [];
  for (const [key, q] of queues) {
    const [customer_id, pool_id, keg_size] = key.split("|");
    for (const s of q) out.push({ customer_id, pool_id, keg_size, qty: s.qty, shipped_at: s.at, days: Math.floor((now.getTime() - new Date(s.at).getTime()) / 86_400_000) });
  }
  return out;
}
