// lib/keg-deposits.ts — does a customer's keg deposit agree with the kegs
// they hold? The deposit refund (credit memo) and the Returned keg event are
// separate records, decided 2026-09-26 for issue #577, so they can drift.
// Pure: joins keg_customer_balances and keg_deposit_balances rows per
// customer × pool × size. A row is a mismatch only when a deposit was ever
// invoiced for it and kegs out differs from kegs on deposit; a customer never
// charged a deposit has nothing to reconcile.
export type KegBalanceRow = { customer_id: string; pool_id: string; keg_size: string; qty: number };
export type DepositBalanceRow = { customer_id: string; keg_pool_id: string; keg_size: string; kegs_on_deposit: number; deposit_cents: number };
export type KegDepositRow = {
  customer_id: string; pool_id: string; keg_size: string;
  kegs_out: number; kegs_on_deposit: number; deposit_cents: number; mismatch: boolean;
};

export function kegDepositRows(kegs: KegBalanceRow[], deposits: DepositBalanceRow[]): KegDepositRow[] {
  const rows = new Map<string, KegDepositRow & { invoiced: boolean }>();
  const row = (customer_id: string, pool_id: string, keg_size: string) => {
    const key = `${customer_id}|${pool_id}|${keg_size}`;
    const r = rows.get(key) ?? { customer_id, pool_id, keg_size, kegs_out: 0, kegs_on_deposit: 0, deposit_cents: 0, mismatch: false, invoiced: false };
    rows.set(key, r);
    return r;
  };
  for (const k of kegs) row(k.customer_id, k.pool_id, k.keg_size).kegs_out += Number(k.qty);
  for (const d of deposits) {
    const r = row(d.customer_id, d.keg_pool_id, d.keg_size);
    r.kegs_on_deposit += Number(d.kegs_on_deposit);
    r.deposit_cents += Number(d.deposit_cents);
    r.invoiced = true;
  }
  return [...rows.values()]
    .filter((r) => r.kegs_out !== 0 || r.kegs_on_deposit !== 0)
    .map(({ invoiced, ...r }) => ({ ...r, mismatch: invoiced && r.kegs_out !== r.kegs_on_deposit }));
}
