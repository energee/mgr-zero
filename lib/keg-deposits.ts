// lib/keg-deposits.ts — does a customer's keg deposit agree with the kegs
// they hold? The deposit refund (credit memo) and the Returned keg event are
// separate records, decided 2026-09-26 for issue #577, so they can drift.
// Pure: joins keg_customer_balances and keg_deposit_balances rows per
// customer × pool × size. A row is a mismatch only once a deposit on it was
// refunded (the drift #577 names) and the kegs on deposit differ from kegs out
// plus kegs lost at the customer, whose deposit is kept. Shipping an order
// charges the deposit but records no keg event, so an unrefunded row is never
// flagged: that gap is a Shipped event not entered yet, not drift.
export type KegBalanceRow = { customer_id: string; pool_id: string; keg_size: string; qty: number };
export type DepositBalanceRow = { customer_id: string; keg_pool_id: string; keg_size: string; kegs_on_deposit: number; deposit_cents: number };
export type KegDepositRow = {
  customer_id: string; pool_id: string; keg_size: string;
  kegs_out: number; kegs_on_deposit: number; deposit_cents: number; mismatch: boolean;
};

/** `lost` is kegs lost at each customer; `refunded` is keg deposit refund
 *  quantities (any row there means a refund happened). Both keyed like kegs. */
export function kegDepositRows(kegs: KegBalanceRow[], deposits: DepositBalanceRow[], { lost, refunded }: { lost: KegBalanceRow[]; refunded: KegBalanceRow[] }): KegDepositRow[] {
  const rows = new Map<string, KegDepositRow & { lost: number; refunded: boolean }>();
  const row = (customer_id: string, pool_id: string, keg_size: string) => {
    const key = `${customer_id}|${pool_id}|${keg_size}`;
    const r = rows.get(key) ?? { customer_id, pool_id, keg_size, kegs_out: 0, kegs_on_deposit: 0, deposit_cents: 0, mismatch: false, lost: 0, refunded: false };
    rows.set(key, r);
    return r;
  };
  for (const k of kegs) row(k.customer_id, k.pool_id, k.keg_size).kegs_out += Number(k.qty);
  for (const d of deposits) {
    const r = row(d.customer_id, d.keg_pool_id, d.keg_size);
    r.kegs_on_deposit += Number(d.kegs_on_deposit);
    r.deposit_cents += Number(d.deposit_cents);
  }
  for (const l of lost) row(l.customer_id, l.pool_id, l.keg_size).lost += Number(l.qty);
  for (const f of refunded) row(f.customer_id, f.pool_id, f.keg_size).refunded = true;
  return [...rows.values()]
    .filter((r) => r.kegs_out !== 0 || r.kegs_on_deposit !== 0)
    .map(({ lost, refunded, ...r }) => ({ ...r, mismatch: refunded && r.kegs_on_deposit !== r.kegs_out + lost }));
}
