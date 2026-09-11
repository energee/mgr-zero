import type { FormEventHandler } from "react";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { gravityPlaceholder, gravityUnitShort, type GravityUnit } from "@/lib/mgr/gravity-unit";

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
    value: values[name],
    readOnly: !onChange,
    onChange: onChange ? (event: React.ChangeEvent<HTMLInputElement>) => onChange(name, event.target.value) : undefined,
  });
  return (
    <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4">
      <fieldset disabled={locked || busy} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="fr-observed">Observed at</Label>
          <Input id="fr-observed" type="datetime-local" step="1" {...field("observedAt")} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fr-temp">Temperature (°F)</Label>
          <Input id="fr-temp" type="number" step="any" {...field("tempF")} required />
          {prior?.tempF && <p className="text-xs text-muted-foreground">Prior {prior.tempF} °F</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fr-gravity">Gravity ({gravityUnitShort(unit)}) · optional</Label>
          <Input
            id="fr-gravity" type="text" inputMode="decimal" placeholder={gravityPlaceholder(unit)}
            {...field("gravity")}
            aria-invalid={gravityInvalid} aria-describedby={gravityInvalid ? "fr-gravity-error" : undefined}
          />
          {gravityInvalid ? (
            <p id="fr-gravity-error" role="alert" className="text-sm text-destructive">
              {unit === "sg"
                ? "Enter a gravity like 1.050 or 1050, or leave it blank."
                : "Enter a gravity in °Plato like 12.5, or leave it blank."}
            </p>
          ) : prior?.gravity ? <p className="text-xs text-muted-foreground">Prior {prior.gravity}</p> : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fr-ph">pH · optional</Label>
          <Input id="fr-ph" type="number" step="any" {...field("ph")} />
          {prior?.ph && <p className="text-xs text-muted-foreground">Prior {prior.ph}</p>}
        </div>
        <p className="text-sm text-muted-foreground">Enter only values taken now; blanks are not rewritten.</p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fr-note">Note · optional</Label>
          <Input id="fr-note" {...field("note")} />
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
