// app/(app)/catalog/brands/[id]/compliance-forms.tsx — the brand's two
// compliance sheets (screen records Brand approval, State registration):
// upsert_brand_approval and upsert_state_registration. Add approval reuses a
// saved record when its kind and TTB ID match. The brand is fixed: the sheet is
// opened from one brand. Search results and direct TTB-ID entry both load
// approved label choices, keeping the saved or only label chosen. Fields and
// the selected image save together only when Save approval is pressed.
"use client";

import { useState } from "react";
import { CommandForm, CommandFormFooter, CommandFormMessage, sheetTrigger } from "@/components/mgr/command-form";
import { BrandApprovalView } from "@/components/mgr/views/brand-approval";
import { StateRegistrationView } from "@/components/mgr/views/state-registration";
import type { Approval, ColaSearch, Registration } from "@/lib/commands/compliance";
import { useCommandAction, useCommandForm, useFields } from "@/lib/commands/use-command-form";
import { APPROVAL_KINDS, approvalInput, approvalNumberError, colaChoice } from "@/lib/mgr/brand-approval-view";
import { registrationInput, registrationSubmitReason } from "@/lib/mgr/state-registration-view";
import { E } from "@/components/mgr/e";
import { defaultColaImage } from "@/lib/mgr/cola-review";
import type { ColaDetails } from "@/lib/ttb/colas";
import { ColaImage } from "../../cola-image";
type Brand = { id: string; name: string };

export function ApprovalForm({ brand, approval, approvals = [] }: { brand: Brand; approval?: Approval; approvals?: Approval[] }) {
  // The expiry and note stay omitted, so saving visible fields keeps them.
  const { v, set, patch, reset } = useFields({
    kind: approval?.kind ?? "cola", ttbId: approval?.ttb_id ?? "", serialNumber: approval?.serial_number ?? "",
    approvedOn: approval?.approved_on ?? "", imageUrl: approval?.image_url ?? "",
  });
  const search = useCommandAction();
  const [colas, setColas] = useState<ColaSearch>();
  const [details, setDetails] = useState<ColaDetails>();
  const [loadingCola, setLoadingCola] = useState(false);
  const form = useCommandForm("upsert_brand_approval", {
    build: () => approvalInput(brand.id, v, approval, approvals),
    reset: () => { reset(); setColas(undefined); setDetails(undefined); search.setError(null); },
  });
  const busy = search.busy || form.busy;
  const savedCola = approvals.find(row => row.kind === "cola" && row.ttb_id === v.ttbId.trim());
  const imageOptions = details?.images ?? (v.imageUrl ? [{ url: v.imageUrl, label: "Saved COLA label image" }] : []);

  async function loadCola(ttbId: string) {
    const id = ttbId.trim();
    setDetails(undefined);
    setLoadingCola(true);
    try {
      await search.run("get_cola_details", { ttbId: id }, data => {
        const found = data as ColaDetails;
        const saved = approval?.ttb_id === id ? approval : approvals.find(row => row.kind === "cola" && row.ttb_id === id);
        setDetails(found);
        patch({ approvedOn: found.approvedOn ?? "", imageUrl: defaultColaImage(found, saved?.image_url) });
      }, { refresh: false, durable: false });
    } finally {
      setLoadingCola(false);
    }
  }

  function changeNumber(ttbId: string) {
    setDetails(undefined);
    search.setError(null);
    const saved = approvals.find(row => row.kind === v.kind && row.ttb_id === ttbId.trim());
    if (saved) patch({ ttbId, serialNumber: saved.serial_number ?? "", approvedOn: saved.approved_on ?? "", imageUrl: saved.image_url ?? "" });
    else patch({ ttbId, imageUrl: "" });
  }

  const model = {
    brand: brand.name, kind: v.kind, kindOptions: APPROVAL_KINDS,
    number: v.ttbId, serialNumber: v.serialNumber, approvedOn: v.approvedOn,
    searching: search.busy && !loadingCola, colas, colaDetails: details,
    imageUrl: v.imageUrl, loadingCola, busy,
    existingColaIds: approvals.filter(row => row.kind === "cola").map(row => row.ttb_id),
    updatesExisting: !approval && Boolean(savedCola),
  };
  const controls = {
    kind: (kind: string) => { set("kind")(kind); set("imageUrl")(""); setDetails(undefined); search.setError(null); },
    number: changeNumber, serialNumber: set("serialNumber"),
    approvedOn: (value: string) => {
      set("approvedOn")(value);
      if (!value) { set("imageUrl")(""); setDetails(undefined); }
    },
    findCola: () => { void search.run("search_colas", { name: brand.name }, data => setColas(data as ColaSearch), { refresh: false, durable: false }); },
    useCola: (record: ColaSearch["rows"][number]) => { patch({ ...colaChoice(record), imageUrl: "" }); void loadCola(record.ttbId); },
    loadCola: () => { void loadCola(v.ttbId); },
    chooseImage: set("imageUrl"),
  };
  const reason = approvalNumberError(v.kind, v.ttbId) ?? (details?.images.length && !v.imageUrl ? "Choose a label image." : undefined);
  return (
    <CommandForm open={form.open} onOpenChange={open => { if (!busy) form.setOpen(open); }} title="Brand approval" trigger={sheetTrigger(!!approval, "Add approval", approval && `${approval.kind.toUpperCase()} ${approval.ttb_id}`)}>
      <form onSubmit={event => {
        if (busy || reason) { event.preventDefault(); event.stopPropagation(); return; }
        void form.submit(event);
      }} className="flex flex-col gap-4">
        <BrandApprovalView
          model={model}
          controls={controls}
          images={Object.fromEntries(imageOptions.map(image => [image.url, <ColaImage key={`${v.ttbId}:${image.url}`} ttbId={v.ttbId.trim()} url={image.url} label={image.label} />]))}
          messages={<><CommandFormMessage error={search.error} /><CommandFormMessage error={form.error} /></>}
          footer={<CommandFormFooter>{E.submit("Save approval", { submitting: busy, reason })}</CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}

export function RegistrationForm({ brand, registration }: { brand: Brand; registration?: Registration }) {
  // state is locked when editing: a registration is addressed by brand and state, so changing it would add a row, not move it.
  // approved_on is not shown; registrationInput omits it, so the upsert keeps it (#438, #522).
  const { v, set, reset } = useFields({ state: registration?.state ?? "", registrationNo: registration?.registration_no ?? "", expiresOn: registration?.expires_on ?? "" });
  const form = useCommandForm("upsert_state_registration", {
    validationFields: ["state"],
    build: () => registrationInput(brand.id, v),
    reset,
  });
  const model = {
    brand: brand.name,
    state: v.state, registrationNo: v.registrationNo, expiresOn: v.expiresOn,
  };
  const controls = { state: set("state"), registrationNo: set("registrationNo"), expiresOn: set("expiresOn") };
  const reason = registrationSubmitReason(model);
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="State registration" trigger={sheetTrigger(!!registration, "Add registration", registration && `${registration.state} registration`)}>
      <form noValidate onSubmit={event => {
        if (form.busy || reason) { event.preventDefault(); event.stopPropagation(); return; }
        void form.submit(event);
      }} className="flex flex-col gap-4">
        <StateRegistrationView
          model={model}
          controls={controls}
          locked={Boolean(registration)}
          messages={<CommandFormMessage error={form.error} />}
          stateError={form.fieldErrors.state}
          submitting={form.submitting}
          onCancel={() => form.setOpen(false)}
        />
      </form>
    </CommandForm>
  );
}
