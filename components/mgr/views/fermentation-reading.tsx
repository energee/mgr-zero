import type { FormEventHandler } from "react";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { Button } from "@/components/ui/button";
import { gravityPlaceholder, gravityUnitShort, type GravityUnit } from "@/lib/mgr/gravity-unit";
import { E } from "@/components/mgr/e";
import { READING_BOUNDS } from "@/lib/composer/offline-policy";
import { batNo } from "@/lib/mgr/doc-no";
import { readingValidation } from "@/lib/mgr/fermentation-reading-view";
import { SubmitButton } from "@/components/mgr/submit-button";

export type FermentationReadingValues = {
  observedAt: string;
  tempF: string;
  gravity: string;
  ph: string;
  note: string;
};

/** Which tank receives the reading, and its batch when the occupancy names one (#716). */
export type FermentationReadingIdentity = { vessel: string; batch?: string };

/** Names the tank and batch from list_occupancies facts; absent facts stay absent. */
export function readingIdentity(o: { vessel_name: string | null; batch_no: number | null; brand_name: string | null }): FermentationReadingIdentity {
  const batch = [o.batch_no == null ? null : batNo(o.batch_no), o.brand_name].filter(Boolean).join(" · ");
  return { vessel: o.vessel_name ?? "unknown vessel", ...(batch ? { batch } : {}) };
}

export type FermentationReadingRecovery = {
  state: "queued" | "uncertain" | "fix" | "permission_changed";
  discardLabel: string;
};

export function FermentationReadingView({
  formId,
  values,
  identity,
  unit,
  prior,
  locked = false,
  busy = false,
  error,
  notice,
  onChange,
  onSubmit,
}: {
  values: FermentationReadingValues;
  formId: string;
  identity: FermentationReadingIdentity;
  unit: GravityUnit;
  prior?: Partial<Pick<FermentationReadingValues, "tempF" | "gravity" | "ph">>;
  locked?: boolean;
  busy?: boolean;
  error?: string | null;
  notice?: string | null;
  onChange?: (field: keyof FermentationReadingValues, value: string) => void;
  onSubmit?: FormEventHandler<HTMLFormElement>;
}) {
  const { errors } = readingValidation(values, unit);
  const field = (name: keyof FermentationReadingValues) => ({
    readOnly: !onChange,
    onChange: onChange ? (value: string) => onChange(name, value) : undefined,
  });
  return (
    <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="text-sm">
        <span className="font-medium">{identity.vessel}</span>
        {identity.batch && <span className="text-muted-foreground"> · {identity.batch}</span>}
      </p>
      <fieldset disabled={locked || busy} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {E.edit("Observed at", values.observedAt, "datetime-local", undefined, { ...field("observedAt"), id: "fr-observed", step: "1", required: true })}
        </div>
        <div className="flex flex-col gap-2">
          {E.edit("Temperature (°F)", values.tempF, "number", undefined, { ...field("tempF"), id: "fr-temp", required: true, ...READING_BOUNDS.tempF, error: values.tempF ? errors.tempF : undefined })}
          {prior?.tempF && <p className="text-xs text-muted-foreground">Prior {prior.tempF} °F</p>}
        </div>
        <div className="flex flex-col gap-2">
          {E.edit(`Gravity (${gravityUnitShort(unit)}) · optional`, values.gravity, "text", undefined, { ...field("gravity"), id: "fr-gravity", inputMode: "decimal", placeholder: gravityPlaceholder(unit), error: errors.gravity })}
          {!errors.gravity && prior?.gravity && <p className="text-xs text-muted-foreground">Prior {prior.gravity}</p>}
          {unit === "plato" && <p className="text-xs text-muted-foreground">Negative °P is valid for fermented beer; SG cannot be negative.</p>}
        </div>
        <div className="flex flex-col gap-2">
          {E.edit("pH · optional", values.ph, "number", undefined, { ...field("ph"), id: "fr-ph", ...READING_BOUNDS.ph, error: errors.ph })}
          {prior?.ph && <p className="text-xs text-muted-foreground">Prior {prior.ph}</p>}
        </div>
        <p className="text-sm text-muted-foreground">Enter only values taken now; blanks are not rewritten.</p>
        <div className="flex flex-col gap-2">
          {E.edit("Note · optional", values.note, "text", undefined, { ...field("note"), id: "fr-note" })}
        </div>
      </fieldset>
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      <CommandFormMessage error={error} />
    </form>
  );
}

export function FermentationReadingActionsView({ formId, values, unit, recovery, busy = false, onFix, onDiscard }: {
  formId: string;
  values: FermentationReadingValues;
  recovery?: FermentationReadingRecovery;
  busy?: boolean;
  unit: GravityUnit;
  onFix?: () => void;
  onDiscard?: () => void;
}) {
  return recovery ? <>
    {(recovery.state === "queued" || recovery.state === "uncertain") && <Button form={formId} type="submit" variant="outline" disabled={busy}>{busy ? "Retrying…" : "Retry exact reading"}</Button>}
    {recovery.state !== "permission_changed" && <Button type="button" variant="outline" disabled={busy} onClick={onFix}>Fix as new reading</Button>}
    <Button type="button" variant="destructive" disabled={busy} onClick={onDiscard}>Discard {recovery.discardLabel}</Button>
  </> : <SubmitButton form={formId} label="Save reading" busy="Saving…" submitting={busy} reason={readingValidation(values, unit).reason} />;
}
