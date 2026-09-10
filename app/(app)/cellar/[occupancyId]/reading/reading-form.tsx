// app/(app)/cellar/[occupancyId]/reading/reading-form.tsx — CommandForm for
// record_fermentation_reading: temperature always, gravity and pH optional
// (a quick temp check is a legitimate reading on its own). Gravity is typed in
// the reader's own unit (`unit`, resolved once by the page from
// get_gravity_unit) and converted to the stored degrees Plato on submit —
// record_fermentation_reading only ever receives Plato. Unreadable input is
// refused here rather than dropped: parseGravity answers INVALID_GRAVITY, the
// field says so and Save stays disabled, so a mistyped gravity cannot save a
// reading that silently has none.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCommandContext } from "@/app/(app)/brewery-provider";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { command } from "@/lib/commands/client";
import {
  createReadingAttempt,
  discardOutbox,
  outboxDiscardConfirmation,
  readOutbox,
  sendOutboxAttempt,
  storeOutboxAttempt,
  visibleOutbox,
  type OutboxAttempt,
} from "@/lib/composer/outbox";
import { formatGravity, gravityPlaceholder, gravityUnitShort, INVALID_GRAVITY, parseGravity, type GravityUnit } from "@/lib/mgr/gravity-unit";

function localObservationValue(iso = new Date().toISOString()) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}

export function ReadingForm({ occupancyId, occupancyLabel, unit, role }: {
  occupancyId: string;
  occupancyLabel: string;
  unit: GravityUnit;
  role: "admin" | "brewer";
}) {
  const router = useRouter();
  const expectedContext = useCommandContext();
  const scope = { actorId: expectedContext.actorId, breweryId: expectedContext.breweryId ?? "", role } as const;
  const [open, setOpenState] = useState(false);
  const [tempF, setTempF] = useState("");
  const [gravity, setGravity] = useState("");
  const [ph, setPh] = useState("");
  const [note, setNote] = useState("");
  const [observedAt, setObservedAt] = useState("");
  const [attempt, setAttempt] = useState<OutboxAttempt | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Parsed once per keystroke: the same answer drives the error line, the
  // Save button and the value that is sent.
  const parsedGravity = useMemo(() => parseGravity(gravity, unit), [gravity, unit]);
  const gravityInvalid = parsedGravity === INVALID_GRAVITY;

  useEffect(() => {
    const fixId = new URLSearchParams(location.search).get("fixReading");
    if (!fixId) return;
    try {
      const original = visibleOutbox(readOutbox(localStorage), scope).find((entry) => entry.id === fixId && entry.input.occupancyId === occupancyId);
      if (!original) return;
      queueMicrotask(() => {
        setTempF(String(original.input.tempF));
        setGravity(original.input.gravityPlato == null ? "" : formatGravity(original.input.gravityPlato, unit));
        setPh(original.input.ph == null ? "" : String(original.input.ph));
        setNote(original.input.note ?? "");
        setObservedAt(localObservationValue(original.input.at));
        setNotice("Review this fresh draft before saving. The original uncertain reading stays in the outbox until you explicitly discard it.");
        setOpenState(true);
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Offline outbox could not be read.";
      queueMicrotask(() => setError(message));
    }
  // The page is keyed to this signed-in scope; role changes remount it through the server layout.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occupancyId, expectedContext.actorId, expectedContext.breweryId, role]);

  function reset() {
    setTempF(""); setGravity(""); setPh(""); setNote(""); setObservedAt("");
    setAttempt(null); setError(null); setNotice(null);
  }

  function setOpen(next: boolean) {
    setOpenState(next);
    if (next && !observedAt) setObservedAt(localObservationValue());
    if (!next) reset();
  }

  async function deliver(entry: OutboxAttempt) {
    setSubmitting(true); setError(null);
    try {
      const result = await sendOutboxAttempt(localStorage, entry.id, scope, command);
      if (result.status === "sent") {
        setOpen(false);
        router.refresh();
        return;
      }
      setAttempt(result.entry ?? entry);
      setError(result.entry?.lastError ?? (result.status === "permission_changed"
        ? "Your current role cannot send this reading."
        : "The reading response could not be confirmed. Retry uses the exact saved request."));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The reading response could not be confirmed."); }
    finally { setSubmitting(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (attempt) { await deliver(attempt); return; }
    setError(null); setNotice(null);
    try {
      const next = createReadingAttempt(scope, {
        occupancyId,
        at: new Date(observedAt).toISOString(),
        tempF: Number(tempF),
        gravityPlato: typeof parsedGravity === "number" ? parsedGravity : undefined,
        ph: ph ? Number(ph) : undefined,
        note: note || undefined,
      }, `Record fermentation reading · ${occupancyLabel}`);
      // Persistence is the gate: fetch is unreachable if this throws.
      storeOutboxAttempt(localStorage, next);
      setAttempt(next);
      if (navigator.onLine) await deliver(next);
      else setNotice("Reading saved to the outbox with this observation time. It will send when this account is back online.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Reading could not be saved to the outbox."); }
  }

  function startFix() {
    setAttempt(null);
    setError(null);
    setNotice("Review the fields and save a fresh request. The original attempt remains in the outbox.");
  }

  function discardAttempt() {
    if (!attempt) return;
    const confirmation = outboxDiscardConfirmation([attempt]);
    if (!confirm(confirmation)) return;
    try { discardOutbox(localStorage, scope, [attempt.id], confirmation); reset(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The queued reading was not discarded."); }
  }

  const locked = attempt !== null;
  return (
    <CommandForm open={open} onOpenChange={setOpen} title="Reading" trigger={<Button size="sm">Reading</Button>}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <fieldset disabled={locked || submitting} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="fr-observed">Observed at</Label>
          <Input id="fr-observed" type="datetime-local" step="1" value={observedAt} onChange={(e) => setObservedAt(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fr-temp">Temperature (°F)</Label>
          <Input id="fr-temp" type="number" step="any" value={tempF} onChange={(e) => setTempF(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fr-gravity">Gravity ({gravityUnitShort(unit)}) · optional</Label>
          {/* Deliberately not type="number": that hands back "" for unreadable
              input, so the field could never tell the brewer what was wrong. */}
          <Input
            id="fr-gravity" type="text" inputMode="decimal" placeholder={gravityPlaceholder(unit)}
            value={gravity} onChange={(e) => setGravity(e.target.value)}
            aria-invalid={gravityInvalid} aria-describedby={gravityInvalid ? "fr-gravity-error" : undefined}
          />
          {gravityInvalid ? (
            <p id="fr-gravity-error" role="alert" className="text-sm text-destructive">
              {unit === "sg"
                ? "Enter a gravity like 1.050 or 1050, or leave it blank."
                : "Enter a gravity in °Plato like 12.5, or leave it blank."}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fr-ph">pH · optional</Label>
          <Input id="fr-ph" type="number" step="any" value={ph} onChange={(e) => setPh(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fr-note">Note · optional</Label>
          <Input id="fr-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        </fieldset>
        {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
        <CommandFormMessage error={error} />
        <CommandFormFooter>
          {attempt ? <>
            {(attempt.state === "queued" || attempt.state === "uncertain") && <Button type="submit" variant="outline" disabled={submitting}>{submitting ? "Retrying…" : "Retry exact reading"}</Button>}
            <Button type="button" variant="outline" disabled={submitting} onClick={startFix}>Fix as new reading</Button>
            <Button type="button" variant="destructive" disabled={submitting} onClick={discardAttempt}>Discard queued reading</Button>
          </> : <Button type="submit" disabled={submitting || !tempF || !observedAt || gravityInvalid}>{submitting ? "Saving…" : "Save reading"}</Button>}
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
