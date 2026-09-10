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

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCommandContext } from "@/app/(app)/brewery-provider";
import { Button } from "@/components/ui/button";
import { CommandForm } from "@/components/mgr/command-form";
import { FermentationReadingActionsView, FermentationReadingView, type FermentationReadingValues } from "@/components/mgr/views/fermentation-reading";
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
import { formatGravity, INVALID_GRAVITY, parseGravity, type GravityUnit } from "@/lib/mgr/gravity-unit";

function localObservationValue(iso = new Date().toISOString()) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}

export function ReadingForm({ occupancyId, occupancyLabel, unit, role, prior }: {
  occupancyId: string;
  occupancyLabel: string;
  unit: GravityUnit;
  role: "admin" | "brewer";
  prior?: Partial<Pick<FermentationReadingValues, "tempF" | "gravity" | "ph">>;
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

  const reset = useCallback(() => {
    setTempF(""); setGravity(""); setPh(""); setNote(""); setObservedAt("");
    setAttempt(null); setError(null); setNotice(null);
  }, []);

  function setOpen(next: boolean) {
    setOpenState(next);
    if (next && !observedAt) setObservedAt(localObservationValue());
    if (!next) reset();
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

  const values = { observedAt, tempF, gravity, ph, note };
  const recovery = attempt ? { state: attempt.state, discardLabel: `${occupancyLabel} reading` } : undefined;
  const formId = "fermentation-reading-form";
  return (
    <CommandForm
      open={open}
      onOpenChange={setOpen}
      title="Reading"
      trigger={<Button size="sm">Reading</Button>}
      footer={<FermentationReadingActionsView formId={formId} values={values} recovery={recovery} busy={submitting} gravityInvalid={gravityInvalid} onFix={startFix} onDiscard={discardAttempt} />}
    >
      <FermentationReadingView
        formId={formId}
        values={values}
        unit={unit}
        prior={prior}
        locked={attempt !== null}
        busy={submitting}
        gravityInvalid={gravityInvalid}
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
