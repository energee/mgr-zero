// components/mgr/views/brand-approval.tsx — shared Brand approval sheet body.
"use client";
import { Fragment, useId, useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { formatDate } from "@/lib/date-format";
import { RegistryDate, RegistryInput, RegistrySelect } from "@/components/mgr/views/registry-fields";
import { approvalNumberError, approvalNumberLabel, colaUrl, type BrandApprovalViewModel } from "@/lib/mgr/brand-approval-view";
import type { ColaRecord } from "@/lib/ttb/colas";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { ColaLabelChoices } from "@/components/mgr/views/cola-label-choices";
import { ColaLabelImageView } from "@/components/mgr/views/cola-label-image";

type Controls = Partial<Record<"kind" | "number" | "serialNumber" | "approvedOn", (value: string) => void>> & {
  /** Runs search_colas for the brand; absent in the inventory, so the button is inert. */
  findCola?: () => void;
  /** Copies a found COLA's TTB ID, serial and approval date into the sheet (colaChoice). */
  useCola?: (record: ColaRecord) => void;
  loadCola?: () => void;
  chooseImage?: (url: string) => void;
};

/** Open COLA from the TTB ID, or why it is missing. Opening it does not verify the approval. */
function colaLink(ttbId: string) {
  const href = colaUrl(ttbId);
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground underline">Open COLA on TTB’s public registry</a>
    : <p className="text-sm text-muted-foreground">Enter a 14-digit TTB ID to open the COLA on TTB’s public registry.</p>;
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

export function BrandApprovalView({ model, controls = {}, messages, footer, images }: {
  model: BrandApprovalViewModel; controls?: Controls; messages?: ReactNode; footer?: ReactNode;
  images?: Record<string, ReactNode>;
}) {
  const [internalKind, setInternalKind] = useState(model.kind);
  const [internalNumber, setInternalNumber] = useState(model.number ?? "");
  const kind = controls.kind ? model.kind : internalKind;
  const number = controls.number ? model.number ?? "" : internalNumber;
  const cola = kind === "cola";
  const numberId = useId();
  const [touched, setTouched] = useState(false);
  const numberError = approvalNumberError(kind, number);
  return (
    <fieldset disabled={model.busy} className="flex min-w-0 flex-col gap-4">
      {E.fld("Brand", model.brand)}
      <RegistrySelect label="Approval" value={kind} options={model.kindOptions} onChange={controls.kind ?? setInternalKind} />
      {E.edit(approvalNumberLabel(kind), number, "text", cola ? model.existingColaIds : undefined, {
        id: numberId, onChange: controls.number ?? setInternalNumber, onBlur: () => setTouched(true), required: true,
        maxLength: cola ? 14 : undefined, pattern: cola ? "[0-9]{14}" : undefined, inputMode: cola ? "numeric" : undefined,
        error: touched ? numberError : undefined, "aria-describedby": cola ? `${numberId}-help` : undefined,
      })}
      {cola && <FieldDescription id={`${numberId}-help`}>TTB assigns a 14-digit ID. Keep leading zeros; this is not your applicant serial number. {number.length >= 12 && `${number.length} / 14 digits`}</FieldDescription>}
      {cola && <>
        <p className="text-sm text-muted-foreground">Enter a TTB ID directly, or choose one saved on this brand. Name search is optional.</p>
        {E.btn(model.loadingCola ? "Loading COLA…" : "Load COLA by TTB ID", model.busy || Boolean(numberError) ? "g disabled" : "g", undefined, controls.loadCola)}
        {model.updatesExisting && E.info("This TTB ID is already on this brand. Saving updates that approval instead of adding a duplicate.")}
        {model.colaDetails && <ColaLabelChoices details={model.colaDetails} imageUrl={model.imageUrl ?? ""} busy={model.busy} images={images} chooseImage={controls.chooseImage} />}
        {!model.colaDetails && model.imageUrl && (images?.[model.imageUrl] ?? <ColaLabelImageView label="Saved COLA label image" />)}
        <RegistryInput label="Serial number · optional" value={model.serialNumber ?? ""} onChange={controls.serialNumber} />
        {colaLink(number)}
        {colaSearchResults(model, controls)}
      </>}
      <RegistryDate label="Date approved · optional" value={model.approvedOn ?? ""} onChange={controls.approvedOn} />
      {messages}
      {footer !== undefined ? footer : E.pin(<>
        <Button type="button" variant="outline">Cancel</Button>
        {E.submit("Save approval", { reason: numberError })}
      </>)}
    </fieldset>
  );
}
