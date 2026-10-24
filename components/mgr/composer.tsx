"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { useCommandContext } from "@/lib/brewery-provider";
import { ComposerDrawerView } from "@/components/mgr/views/composer-drawer";
import { OfflineOutboxView } from "@/components/mgr/views/composer";
import { ComposerLoadBoundary, ComposerUnavailableView } from "@/components/mgr/composer-load-boundary";
import { Button } from "@/components/ui/button";
import { command } from "@/lib/commands/client";
import { discardOutbox, dismissOutboxQuarantine, flushOutbox, outboxDiscardConfirmation, outboxQuarantineNotice, readOutbox, sendOutboxAttempt, visibleOutbox, type OutboxAttempt } from "@/lib/composer/outbox";
import type { StaffRole } from "@/lib/commands/registry";

const ComposerConversation = lazy(() => import("@/components/mgr/composer-conversation"));

export const isComposerShortcut = (event: { key?: string; metaKey?: boolean; ctrlKey?: boolean }) =>
  event.key?.toLowerCase() === "k" && Boolean(event.metaKey || event.ctrlKey);

export function Composer({ roles, chatConfigured }: { roles: readonly StaffRole[]; chatConfigured: boolean }) {
  const expectedContext = useCommandContext();
  const breweryId = expectedContext.breweryId ?? "";
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [outboxOpen, setOutboxOpen] = useState(false);
  const [outboxBusy, setOutboxBusy] = useState(false);
  const [outboxEntries, setOutboxEntries] = useState<OutboxAttempt[]>([]);
  // Why the outbox list may be incomplete: set-aside entries or a read failure.
  const [outboxNotice, setOutboxNotice] = useState<string | null>(null);

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) setHasOpened(true);
    setOpen(nextOpen);
  }

  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if (!isComposerShortcut(event)) return;
      event.preventDefault();
      setHasOpened(true);
      setOpen(true);
      setFocusRequest((request) => request + 1);
    };
    addEventListener("keydown", focus); return () => removeEventListener("keydown", focus);
  }, []);

  // A server refresh passes a new roles array with the same members; key the
  // effect on the members so it does not re-flush the outbox on every refresh.
  const rolesKey = roles.toSorted().join(",");
  useEffect(() => {
    const scope = { actorId: expectedContext.actorId, breweryId, roles };
    // Reading the outbox must never throw out of this effect: the Composer sits
    // in the staff layout, so an escape here errors every staff page (#463).
    const refresh = () => {
      try { setOutboxEntries(visibleOutbox(readOutbox(localStorage), scope)); setOutboxNotice(outboxQuarantineNotice(localStorage)); }
      catch (cause) { setOutboxNotice(cause instanceof Error ? cause.message : "Offline outbox could not be read."); }
    };
    const flush = async () => { if (!navigator.onLine) return refresh(); setOutboxBusy(true); try { await flushOutbox(localStorage, scope, command); refresh(); } catch (cause) { refresh(); setOutboxNotice(cause instanceof Error ? cause.message : "Offline outbox could not be sent."); } finally { setOutboxBusy(false); } };
    addEventListener("online", flush); addEventListener("mgr-outbox-change", refresh); refresh(); if (navigator.onLine) void flush();
    return () => { removeEventListener("online", flush); removeEventListener("mgr-outbox-change", refresh); };
  }, [breweryId, expectedContext.actorId, rolesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function retryOutbox(id?: string) {
    const scope = { actorId: expectedContext.actorId, breweryId, roles }; setOutboxBusy(true);
    try { if (id) await sendOutboxAttempt(localStorage, id, scope, command); else await flushOutbox(localStorage, scope, command); setOutboxEntries(visibleOutbox(readOutbox(localStorage), scope)); }
    finally { setOutboxBusy(false); }
  }

  function discardEntries(ids: string[]) {
    const scope = { actorId: expectedContext.actorId, breweryId, roles };
    const confirmation = outboxDiscardConfirmation(outboxEntries.filter((entry) => ids.includes(entry.id)));
    if (!confirm(confirmation)) return;
    discardOutbox(localStorage, scope, ids, confirmation); setOutboxEntries(visibleOutbox(readOutbox(localStorage), scope));
  }

  const outbox = outboxOpen && <><OfflineOutboxView notice={outboxNotice ?? undefined} onDismissNotice={() => { try { dismissOutboxQuarantine(localStorage); } finally { setOutboxNotice(null); } }} rows={outboxEntries.map((entry) => ({ id: entry.id, label: entry.label, status: entry.lastError ?? entry.state, retryable: entry.state === "queued" || entry.state === "uncertain" }))} busy={outboxBusy} onRetry={(id) => void retryOutbox(id)} onRetryAll={() => void retryOutbox()} onDiscard={(id) => discardEntries([id])} onDiscardAll={() => discardEntries(outboxEntries.map((entry) => entry.id))} /><Button type="button" variant="ghost" className="self-start" onClick={() => setOutboxOpen(false)}>Close outbox</Button></>;

  return <ComposerDrawerView open={open} onOpenChange={changeOpen}>
    {/* Keep a started conversation mounted when minimized: drafts and streams survive. */}
    {hasOpened && <ComposerLoadBoundary fallback={<ComposerUnavailableView failed outboxCount={outboxEntries.length} onOutbox={() => setOutboxOpen(true)}>{outbox}</ComposerUnavailableView>}>
      <Suspense fallback={<ComposerUnavailableView outboxCount={outboxEntries.length} onOutbox={() => setOutboxOpen(true)}>{outbox}</ComposerUnavailableView>}>
        <ComposerConversation chatConfigured={chatConfigured} open={open} onOpenChange={changeOpen} focusRequest={focusRequest} outboxCount={outboxEntries.length} onOutbox={() => setOutboxOpen(true)}>{outbox}</ComposerConversation>
      </Suspense>
    </ComposerLoadBoundary>}
  </ComposerDrawerView>;
}
