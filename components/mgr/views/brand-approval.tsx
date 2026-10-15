// components/mgr/views/brand-approval.tsx — shared Brand approval sheet body.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { formatDate } from "@/lib/date-format";
import { RegistryDate, RegistryInput, RegistrySelect } from "@/components/mgr/views/registry-fields";
import { approvalNumberLabel, colaUrl, type BrandApprovalViewModel } from "@/lib/mgr/brand-approval-view";
import type { ColaRecord } from "@/lib/ttb/colas";

export type { BrandApprovalViewModel };

type Controls = Partial<Record<"kind" | "number" | "serialNumber" | "approvedOn", (value: string) => void>> & {
  /** Runs search_colas for the brand; absent in the inventory, so the button is inert. */
  findCola?: () => void;
  /** Copies a found COLA's TTB ID, serial and approval date into the sheet (colaChoice). */
  useCola?: (record: ColaRecord) => void;
};

/** Open COLA from the TTB ID, or why it is missing. Opening it does not verify the approval. */
function colaLink(ttbId: string) {
  const href = colaUrl(ttbId);
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground underline">Open COLA on TTB’s public registry</a>
    : <p className="text-sm text-muted-foreground">Enter the TTB ID to open the COLA on TTB’s public registry.</p>;
}

/** Find COLA on TTB, then the brand's COLAs under the brewery's permit, each with Use. */
function colaSearchResults(model: BrandApprovalViewModel, controls: Controls) {
  const { colas, searching } = model;
  const use = controls.useCola;
  return <>
    {E.btn(searching ? "Searching TTB…" : "Find COLA on TTB", searching ? "g disabled" : "g", undefined, controls.findCola)}
    {colas && (colas.rows.length === 0
      ? E.info(`No COLAs on TTB under ${colas.permit} match ${model.brand}.`)
      : colas.rows.map((r) => (
        <Fragment key={r.ttbId}>
          {E.row(r.fancifulName, `${r.ttbId} · ${r.serial ? `serial ${r.serial}` : "no serial"} · ${r.className}`, <>
            <span className="text-sm text-muted-foreground">{formatDate(r.completedOn)}</span>
            {E.act("Use", "primary", undefined, use && (() => use(r)))}
          </>)}
        </Fragment>
      )))}
  </>;
}

export function BrandApprovalView({ model, controls = {}, messages, footer }: {
  model: BrandApprovalViewModel; controls?: Controls; messages?: ReactNode; footer?: ReactNode;
}) {
  const cola = model.kind === "cola";
  return (
    <>
      {E.fld("Brand", model.brand)}
      <RegistrySelect label="Approval" value={model.kind} options={model.kindOptions} onChange={controls.kind} />
      <RegistryInput label={approvalNumberLabel(model.kind)} value={model.number ?? ""} onChange={controls.number} required />
      {cola && <>
        <RegistryInput label="Serial number · optional" value={model.serialNumber ?? ""} onChange={controls.serialNumber} />
        {colaLink(model.number ?? "")}
        {colaSearchResults(model, controls)}
      </>}
      <RegistryDate label="Date approved · optional" value={model.approvedOn ?? ""} onChange={controls.approvedOn} />
      {messages}
      {footer !== undefined ? footer : E.btn("Save approval")}
    </>
  );
}
