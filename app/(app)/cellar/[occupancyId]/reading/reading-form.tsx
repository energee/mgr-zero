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

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCommandContext } from "@/lib/brewery-provider";
import { Button } from "@/components/ui/button";
import { CommandForm } from "@/components/mgr/command-form";
import { FermentationReadingActionsView, FermentationReadingView, type FermentationReadingIdentity, type FermentationReadingValues } from "@/components/mgr/views/fermentation-reading";
import { command } from "@/lib/commands/client";
import {
  createReadingAttempt,
  discardOutbox,
  outboxDiscardConfirmation,
  readOutbox,
  readOutboxAttempt,
  sendOutboxAttempt,
  storeOutboxAttempt,
  visibleOutbox,
  type OutboxAttempt,
} from "@/lib/composer/outbox";
import { formatGravity, type GravityUnit } from "@/lib/mgr/gravity-unit";
import { readingValidation } from "@/lib/mgr/fermentation-reading-view";
import type { StaffRole } from "@/lib/commands/registry";
import { dateTimeInput, dateTimeInputInstant } from "@/lib/date-format";

export function ReadingForm({ occupancyId, identity, unit, timeZone, roles, prior, openByDefault = false, returnHref }: {
  occupancyId: string;
  identity: FermentationReadingIdentity;
  unit: GravityUnit;
  timeZone: string;
  roles: readonly StaffRole[];
  prior?: Partial<Pick<FermentationReadingValues, "tempF" | "gravity" | "ph">>;
  openByDefault?: boolean;
  returnHref?: string;
}) {
  const router = useRouter();
  const expectedContext = useCommandContext();
  const scope = { actorId: expectedContext.actorId, breweryId: expectedContext.breweryId ?? "", roles } as const;
  // Effects key on the role members, not the array a server refresh recreates.
  const rolesKey = roles.toSorted().join(",");
  const [open, setOpenState] = useState(openByDefault);
  const [tempF, setTempF] = useState("");
  const [gravity, setGravity] = useState("");
  const [ph, setPh] = useState("");
  const [note, setNote] = useState("");
  const [observedAt, setObservedAt] = useState("");
  const [observationInstant, setObservationInstant] = useState<string>();
  const [attempt, setAttempt] = useState<OutboxAttempt | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const values = { observedAt, tempF, gravity, ph, note };
  const validation = readingValidation(values, unit);
  const initializeObservation = useCallback(() => {
    const instant = new Date().toISOString();
    setObservedAt(dateTimeInput(instant, timeZone));
    setObservationInstant(instant);
  }, [timeZone]);

  useEffect(() => {
    if (openByDefault && !observedAt) queueMicrotask(() => initializeObservation());
  }, [openByDefault, observedAt, initializeObservation]);

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
        setObservedAt(dateTimeInput(original.input.at, timeZone));
        setObservationInstant(original.input.at);
        setNotice("Review this fresh draft before saving. The original uncertain reading stays in the outbox until you explicitly discard it.");
        setOpenState(true);
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Offline outbox could not be read.";
      queueMicrotask(() => setError(message));
    }
  // The page is keyed to this signed-in scope; role changes remount it through the server layout.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occupancyId, expectedContext.actorId, expectedContext.breweryId, rolesKey, timeZone]);

  const reset = useCallback(() => {
    setTempF(""); setGravity(""); setPh(""); setNote(""); setObservedAt("");
    setObservationInstant(undefined);
    setAttempt(null); setError(null); setNotice(null);
  }, []);

  function setOpen(next: boolean) {
    setOpenState(next);
    if (next && !observedAt) initializeObservation();
    if (!next) {
      reset();
      if (returnHref) router.push(returnHref);
    }
  }

  useEffect(() => {
    if (!attempt) return;
    function reconcileAttempt() {
      try {
        const current = readOutboxAttempt(localStorage, attempt!.id);
        if (current) { setAttempt(current); return; }
        setOpenState(false);
        reset();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Offline outbox could not be read.");
      }
    }
    const onStorage = (event: StorageEvent) => { if (event.storageArea === localStorage) reconcileAttempt(); };
    addEventListener("mgr-outbox-change", reconcileAttempt);
    addEventListener("storage", onStorage);
    return () => {
      removeEventListener("mgr-outbox-change", reconcileAttempt);
      removeEventListener("storage", onStorage);
    };
  }, [attempt, reset, router]);

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
    if (!validation.measurements || submitting) return;
    setError(null); setNotice(null);
    try {
      const next = createReadingAttempt(scope, {
        occupancyId,
        at: dateTimeInputInstant(observedAt, timeZone, observationInstant),
        ...validation.measurements,
        note: note || undefined,
      }, `Record fermentation reading · ${identity.vessel}`);
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

  const recovery = attempt ? { state: attempt.state, discardLabel: `${identity.vessel} reading` } : undefined;
  const formId = "fermentation-reading-form";
  return (
    <CommandForm
      open={open}
      onOpenChange={setOpen}
      title="Reading"
      trigger={<Button size="sm">Reading</Button>}
      footer={<FermentationReadingActionsView formId={formId} values={values} unit={unit} recovery={recovery} busy={submitting} onFix={startFix} onDiscard={discardAttempt} />}
    >
      <FermentationReadingView
        formId={formId}
        values={values}
        identity={identity}
        unit={unit}
        timeZone={timeZone}
        prior={prior}
        locked={attempt !== null}
        busy={submitting}
        error={error}
        notice={notice}
        onChange={(field, value) => {
          if (field === "observedAt") setObservedAt(value);
          else if (field === "tempF") setTempF(value);
          else if (field === "gravity") setGravity(value);
          else if (field === "ph") setPh(value);
          else setNote(value);
        }}
        onSubmit={submit}
      />
    </CommandForm>
  );
}
