import type { FormEventHandler } from "react";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { Button } from "@/components/ui/button";
import { gravityPlaceholder, gravityUnitShort, type GravityUnit } from "@/lib/mgr/gravity-unit";
import { E } from "@/components/mgr/e";
import { READING_BOUNDS } from "@/lib/composer/offline-policy";

export type FermentationReadingValues = {
  observedAt: string;
  tempF: string;
  gravity: string;
  ph: string;
  note: string;
};

export type FermentationReadingRecovery = {
  state: "queued" | "uncertain" | "fix" | "permission_changed";
  discardLabel: string;
};

export function FermentationReadingView({
  formId,
  values,
  unit,
  prior,
  locked = false,
  busy = false,
  gravityInvalid = false,
  error,
  notice,
  onChange,
  onSubmit,
}: {
  values: FermentationReadingValues;
  formId: string;
  unit: GravityUnit;
  prior?: Partial<Pick<FermentationReadingValues, "tempF" | "gravity" | "ph">>;
  locked?: boolean;
  busy?: boolean;
  gravityInvalid?: boolean;
  error?: string | null;
  notice?: string | null;
  onChange?: (field: keyof FermentationReadingValues, value: string) => void;
  onSubmit?: FormEventHandler<HTMLFormElement>;
}) {
  const field = (name: keyof FermentationReadingValues) => ({
    readOnly: !onChange,
    onChange: onChange ? (value: string) => onChange(name, value) : undefined,
  });
  return (
    <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4">
      <fieldset disabled={locked || busy} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {E.edit("Observed at", values.observedAt, "datetime-local", undefined, { ...field("observedAt"), id: "fr-observed", step: "1", required: true })}
        </div>
        <div className="flex flex-col gap-2">
          {E.edit("Temperature (°F)", values.tempF, "number", undefined, { ...field("tempF"), id: "fr-temp", required: true, ...READING_BOUNDS.tempF })}
          {prior?.tempF && <p className="text-xs text-muted-foreground">Prior {prior.tempF} °F</p>}
        </div>
        <div className="flex flex-col gap-2">
          {E.edit(`Gravity (${gravityUnitShort(unit)}) · optional`, values.gravity, "text", undefined, { ...field("gravity"), id: "fr-gravity", inputMode: "decimal", placeholder: gravityPlaceholder(unit), "aria-invalid": gravityInvalid, "aria-describedby": gravityInvalid ? "fr-gravity-error" : undefined })}
          {gravityInvalid ? (
            <p id="fr-gravity-error" role="alert" className="text-sm text-destructive">
              {unit === "sg"
                ? "Enter a gravity like 1.050 or 1050, or leave it blank."
                : "Enter a gravity in °Plato like 12.5, or leave it blank."}
            </p>
          ) : prior?.gravity ? <p className="text-xs text-muted-foreground">Prior {prior.gravity}</p> : null}
        </div>
        <div className="flex flex-col gap-2">
          {E.edit("pH · optional", values.ph, "number", undefined, { ...field("ph"), id: "fr-ph", ...READING_BOUNDS.ph })}
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

export function FermentationReadingActionsView({ formId, values, recovery, busy = false, gravityInvalid = false, onFix, onDiscard }: {
  formId: string;
  values: FermentationReadingValues;
  recovery?: FermentationReadingRecovery;
  busy?: boolean;
  gravityInvalid?: boolean;
  onFix?: () => void;
  onDiscard?: () => void;
}) {
  return recovery ? <>
    {(recovery.state === "queued" || recovery.state === "uncertain") && <Button form={formId} type="submit" variant="outline" disabled={busy}>{busy ? "Retrying…" : "Retry exact reading"}</Button>}
    {recovery.state !== "permission_changed" && <Button type="button" variant="outline" disabled={busy} onClick={onFix}>Fix as new reading</Button>}
    <Button type="button" variant="destructive" disabled={busy} onClick={onDiscard}>Discard {recovery.discardLabel}</Button>
  </> : <Button form={formId} type="submit" disabled={busy || !values.tempF || !values.observedAt || gravityInvalid}>{busy ? "Saving…" : "Save reading"}</Button>;
}
