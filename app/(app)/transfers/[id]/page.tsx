// app/(app)/transfers/[id]/page.tsx — one stock transfer: header, lines with
// from/to bins, and the next verb (transfer-actions.tsx): Submit, Record pick,
// Receive. Receiving posts the paired ledger rows; the page then shows what
// moved. Same movements as Complete transfer, no invoice.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { trfNo } from "../trf-no";
import { TransferActions } from "./transfer-actions";

type Detail = {
  transfer: { id: string; transfer_no: number | null; status: string; note: string | null; received_at: string | null; from_location: { name: string } | null; to_location: { name: string } | null };
  lines: { id: string; qty: number; qty_picked: number | null; from_bin_id: string; to_bin_id: string; keg_size: string | null; skus: { name: string } | null; materials: { name: string } | null; keg_pools: { name: string } | null }[];
  bins: { id: string; name: string }[];
};

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const { transfer, lines, bins } = await orNotFound(runCommand("get_stock_transfer", { transferId: id }, ctx) as Promise<Detail>);
  const bin = (b: string) => bins.find((x) => x.id === b)?.name ?? "—";
  const what = (l: Detail["lines"][number]) => l.skus?.name ?? l.materials?.name ?? (l.keg_pools ? `${l.keg_pools.name} · ${l.keg_size?.replace("_", " ")}` : "Line");
  const done = transfer.status === "received";
  return (
    <>
      {E.back("Transfers", trfNo(transfer.transfer_no), undefined, "/transfers")}
      {E.fld(<>From {E.arrow(null)} to</>, <>{transfer.from_location?.name ?? "—"} {E.arrow()} {transfer.to_location?.name ?? "—"}</>)}
      {E.fld("Status", transfer.status.replace("_", " "))}
      {transfer.note ? E.fld("Note", transfer.note) : null}
      {lines.map((l) => (
        <div key={l.id}>
          {E.row(what(l), `${bin(l.from_bin_id)} → ${bin(l.to_bin_id)}`, l.qty_picked === null ? String(Number(l.qty)) : `${Number(l.qty_picked)} / ${Number(l.qty)}`, done ? "ok" : "")}
        </div>
      ))}
      {done ? E.info("Received: the paired movements are on the ledger. No invoice: this is an internal move.") : (
        <>
          {E.sp()}
          <TransferActions transferId={transfer.id} status={transfer.status} lines={lines.map((l) => ({ id: l.id, qty: Number(l.qty), qtyPicked: l.qty_picked === null ? null : Number(l.qty_picked) }))} />
        </>
      )}
    </>
  );
}
