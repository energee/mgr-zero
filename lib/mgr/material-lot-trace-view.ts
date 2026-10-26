// lib/mgr/material-lot-trace-view.ts — pure material recall display model.
import { formatDate } from "@/lib/date-format";
import { batNo, runNo } from "./doc-no";
import { toRecipientViews, type LotTraceRecipientView, type LotTraceSnapshot } from "./lot-trace-view";
import { sentenceCase } from "./labels";

export type MaterialLotTraceSnapshot = {
  lot: { id: string; code: string; material: string; unit: string; vendor: string | null; received_on: string; best_by: string | null };
  on_hand: number;
  used: { id: string; qty: number; at: string; stage: string; batch_id: string | null; run_id: string | null }[];
  batches: { id: string; batch_no: number; brewed_on: string | null; closed_at: string | null; in_vessel?: string | null }[];
  runs: { id: string; run_no: number; closed_at: string | null }[];
  lots: { id: string; code: string; packaged_on: string }[];
  recipients: LotTraceSnapshot["recipients"];
  unlinked_qty: number;
  warning: string;
};
export type MaterialLotTraceViewModel = {
  title: string; detail: string; balance: string; backHref?: string;
  uses: { id: string; title: string; detail: string }[];
  lots: { id: string; title: string; detail: string; href?: string }[];
  recipients: LotTraceRecipientView[]; note: string;
};

/** `timeZone` is breweries.timezone: a use is dated by the brewery's day, not its UTC prefix (#442). */
export function toMaterialLotTraceViewProps(snapshot: MaterialLotTraceSnapshot, timeZone: string, backHref?: string): MaterialLotTraceViewModel {
  const batches = new Map(snapshot.batches.map(batch => [batch.id, batch]));
  const runs = new Map(snapshot.runs.map(run => [run.id, run]));
  return {
    title: snapshot.lot.code, backHref,
    detail: [snapshot.lot.material, snapshot.lot.vendor, `received ${formatDate(snapshot.lot.received_on)}`].filter(Boolean).join(" · "),
    balance: `${Number(snapshot.on_hand)} ${snapshot.lot.unit} recorded on hand`,
    uses: snapshot.used.map(use => ({
      id: use.id,
      title: use.batch_id ? batNo(batches.get(use.batch_id)!.batch_no) : use.run_id ? runNo(runs.get(use.run_id)!.run_no) : "Unlinked consumption",
      detail: [ `${Number(use.qty)} ${snapshot.lot.unit}`, sentenceCase(use.stage), formatDate(use.at, timeZone),
        use.batch_id ? batches.get(use.batch_id)!.in_vessel ?? (batches.get(use.batch_id)!.closed_at ? "Completed" : "No current vessel") : null,
      ].filter(Boolean).join(" · "),
    })),
    lots: snapshot.lots.map(lot => ({ id: lot.id, title: lot.code, detail: `packaged ${formatDate(lot.packaged_on)}`, href: backHref ? `/compliance/lots/${lot.id}` : undefined })),
    recipients: toRecipientViews(snapshot.recipients, backHref),
    note: snapshot.warning + (Number(snapshot.unlinked_qty) > 0 ? ` ${snapshot.unlinked_qty} ${snapshot.lot.unit} of recorded consumption has no batch or run link.` : ""),
  };
}
