import type { FormEventHandler } from "react";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { Button } from "@/components/ui/button";
import { gravityPlaceholder, gravityUnitShort, type GravityUnit } from "@/lib/mgr/gravity-unit";
import { E } from "@/components/mgr/e";
import { READING_BOUNDS } from "@/lib/composer/offline-policy";
import { batNo } from "@/lib/mgr/doc-no";
import { readingValidation } from "@/lib/mgr/fermentation-reading-view";
import { SubmitButton } from "@/components/mgr/submit-button";
import { formatDateTime } from "@/lib/date-format";

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
  timeZone,
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
  timeZone: string;
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
        {/* The time defaults to now, so it stays folded until someone changes it (#1508). */}
        <details className="flex flex-col gap-2">
          <summary className="text-sm">Observed {values.observedAt ? formatDateTime(`${values.observedAt}Z`, "UTC") : "now"} · Change</summary>
          {E.edit(`Observed at (${timeZone})`, values.observedAt, "datetime-local", undefined, { ...field("observedAt"), id: "fr-observed", step: "1", required: true })}
        </details>
        {/* Each prior value is its field's placeholder: a reference, never a typed value (#1508). */}
        {E.edit("Temperature (°F)", values.tempF, "number", undefined, { ...field("tempF"), id: "fr-temp", required: true, ...READING_BOUNDS.tempF, placeholder: prior?.tempF && `Prior ${prior.tempF}`, error: values.tempF ? errors.tempF : undefined })}
        <div className="flex flex-col gap-2">
          {E.edit(`Gravity (${gravityUnitShort(unit)}) · optional`, values.gravity, "text", undefined, { ...field("gravity"), id: "fr-gravity", inputMode: "decimal", placeholder: prior?.gravity ? `Prior ${prior.gravity}` : gravityPlaceholder(unit), error: errors.gravity })}
          {unit === "plato" && <p className="text-xs text-muted-foreground">Negative °P is valid for fermented beer; SG cannot be negative.</p>}
        </div>
        {E.edit("pH · optional", values.ph, "number", undefined, { ...field("ph"), id: "fr-ph", ...READING_BOUNDS.ph, placeholder: prior?.ph && `Prior ${prior.ph}`, error: errors.ph })}
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

/** `next` adds Save and next tank, a second submit named "next" that saves and opens the next occupied tank's reading
 *  in the Cellar map's tile order (#1508); the caller passes it only when such a tank exists. */
export function FermentationReadingActionsView({ formId, values, unit, recovery, busy = false, next = false, onFix, onDiscard }: {
  formId: string;
  values: FermentationReadingValues;
  recovery?: FermentationReadingRecovery;
  busy?: boolean;
  unit: GravityUnit;
  next?: boolean;
  onFix?: () => void;
  onDiscard?: () => void;
}) {
  const reason = readingValidation(values, unit).reason;
  return recovery ? <>
    {(recovery.state === "queued" || recovery.state === "uncertain") && <Button form={formId} type="submit" variant="outline" disabled={busy}>{busy ? "Retrying…" : "Retry exact reading"}</Button>}
    {recovery.state !== "permission_changed" && <Button type="button" variant="outline" disabled={busy} onClick={onFix}>Fix as new reading</Button>}
    <Button type="button" variant="destructive" disabled={busy} onClick={onDiscard}>Discard {recovery.discardLabel}</Button>
  </> : <>
    {next && <Button form={formId} type="submit" name="next" variant="outline" disabled={busy || Boolean(reason)}>Save and next tank</Button>}
    <SubmitButton form={formId} label="Save reading" busy="Saving…" submitting={busy} reason={reason} />
  </>;
}
