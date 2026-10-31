"use client";

import { Fragment, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CommandForm } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import {
  ConnectSquareView, DisconnectSquareView, PosItemView, PosMenuView, PosSyncActions, SquareLocationsView,
} from "@/components/mgr/views/pos";
import { Button } from "@/components/ui/button";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { revocationConfirmed } from "@/lib/mgr/integration-disconnect";
import { toCents } from "@/lib/mgr/money";
import { isTerminalPublication, publicationNotice, readPublicationOutcome, selectExactCommandAttempt, shouldStartNewCommandAttempt, syncFailureMessage, syncResultMessage, type ExactCommandAttempt, type PosLocationRow, type PosMenuModel } from "@/lib/mgr/pos-view";

/**
 * One exact-identity command: a repeat resumes the attempt this tab holds (or
 * its saved request after a reload); `newAttempt` names a fresh id, which
 * replaces the saved one. Reports the id actually sent. `target` scopes the
 * saved request to one item (see recoveryKey).
 */
export function useExactCommand() {
  const action = useCommandAction();
  const [attempt, setAttempt] = useState<ExactCommandAttempt | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  async function run(name: string, input: unknown, newAttempt = false, target?: string) {
    const selected = selectExactCommandAttempt(attempt, { name, input }, newAttempt);
    let sentId = selected.requestId;
    setResult(null);
    const ok = await action.run(selected.name, selected.input, data => setResult(data as Record<string, unknown>),
      { requestId: newAttempt || attempt ? selected.requestId : undefined, target, onSent: id => { sentId = id; setAttempt({ ...selected, requestId: id }); } });
    return { ok, requestId: sentId };
  }
  return { ...action, requestId: attempt?.requestId ?? null, result, run,
    clear: () => { setAttempt(null); setResult(null); action.setError(null); } };
}

export function PosRouteSheet({ title, backHref, children }: { title: string; backHref: string; children: ReactNode }) {
  const router = useRouter();
  return <CommandForm open onOpenChange={open => { if (!open) router.push(backHref); }} title={title}><div className="flex flex-col gap-2">{children}</div></CommandForm>;
}

export function SquareConnectControl({ configured, reconnect = false }: { configured: boolean; reconnect?: boolean }) {
  const action = useCommandAction();
  return <ConnectSquareView configured={configured} reconnect={reconnect} busy={action.busy} error={action.error} onConnect={() => void action.run("connect_square", { reconnect }, data => location.assign((data as { authorizeUrl: string }).authorizeUrl))} />;
}

/** Point of sale's Disconnect: a confirming dialog over the page (#1509).
 *  Runs disconnect_square; on an "unresolved" connection the same command retries revocation by merchant id (#640).
 *  Closes when Square confirmed revocation; otherwise stays open, and the refreshed `status` shows the unresolved outcome and Retry. */
export function SquareDisconnectControl({ connectionId, status }: { connectionId: string; status: "available" | "unresolved" }) {
  const action = useCommandAction();
  const [open, setOpen] = useState(false);
  return <CommandForm open={open} onOpenChange={next => { if (!action.busy) { setOpen(next); action.setError(null); } }} title="Disconnect Square" trigger={E.act("Disconnect", "destructive")}>
    <div className="flex flex-col gap-2"><DisconnectSquareView status={status} busy={action.busy} error={action.error}
      onDisconnect={() => void action.run("disconnect_square", { connectionId }, data => { if (revocationConfirmed(data)) setOpen(false); })} /></div>
  </CommandForm>;
}

type ExactCommand = ReturnType<typeof useExactCommand>;

/** Each sync's outcome: a completed sync reads out in the status region; a
 *  superseded or failed sync stays an E.note alert, since it asks for action. */
export function SyncFeedback({ runs }: { runs: [kind: string, action: ExactCommand][] }) {
  const done: string[] = [], problems: string[] = [];
  for (const [kind, action] of runs) {
    const result = syncResultMessage(kind, action.result, action.requestId);
    const superseded = (action.result as Record<string, unknown> | null)?.superseded === true;
    if (result && !superseded) done.push(result);
    else {
      const problem = result ?? syncFailureMessage(kind, action.failure, action.requestId);
      if (problem) problems.push(problem);
    }
  }
  return <>
    <div role="status">{E.polite(done.join(" · ") || null)}</div>
    {problems.map(problem => <Fragment key={problem}>{E.note(problem, "alert")}</Fragment>)}
  </>;
}

/** Sync Square runs the catalog sync, then the sales sync once the catalog
 *  finished. A sales sync awaiting its exact retry skips the catalog step. */
export function SquareSyncControls() {
  const catalog = useExactCommand(), sales = useExactCommand();
  const salesRetry = sales.failure?.kind === "unknown" && Boolean(catalog.result);
  const retry = catalog.failure?.kind === "unknown" || salesRetry;
  async function sync() {
    if (!salesRetry && !(await catalog.run("sync_square_catalog", {}, shouldStartNewCommandAttempt(catalog.result, catalog.failure))).ok) return;
    await sales.run("sync_square_sales", {}, shouldStartNewCommandAttempt(sales.result, sales.failure));
  }
  return <PosSyncActions busy={catalog.busy || sales.busy} label={retry ? "Retry exact sync" : "Sync Square"} onSync={sync}
    feedback={<SyncFeedback runs={[["Catalog", catalog], ["Sales", sales]]} />} />;
}

export function SquareLocationsControl({ rows, locations }: { rows: PosLocationRow[]; locations: { id: string; name: string }[] }) {
  const action = useCommandAction();
  return <SquareLocationsView rows={rows} locations={locations} busy={action.busy} error={action.error}
    onSave={(row, mgrLocationId) => action.run("set_pos_location_mapping", { posLocationId: row.externalLocationId, mgrLocationId }, undefined, { target: row.externalLocationId })}
    onRetire={row => action.run("retire_pos_location_mapping", { posLocationId: row.externalLocationId }, undefined, { target: row.externalLocationId })} />;
}

/** A publication's outcome. A confirmed publish reads out in the always-mounted
 *  status region; any other outcome stays an E.note alert with its retry verbs. */
export function PublicationResult({ action, onRetry, onCorrected }: { action: ExactCommand; onRetry: () => void; onCorrected: () => void }) {
  const outcome = readPublicationOutcome(action.result);
  const status = outcome?.status ?? "prepared";
  const notice = action.requestId && (outcome || action.failure?.kind === "unknown")
    ? publicationNotice({ requestId: outcome?.attemptId ?? action.requestId, status, errorCode: outcome?.errorCode })
    : null;
  const text = notice && `${notice.label} · ${notice.detail}`;
  return <div className="flex flex-col gap-2">
    <div role="status">{E.polite(notice?.tone === "success" ? text : null)}</div>
    {notice && notice.tone !== "success" && E.note(text, "alert")}
    {notice?.retry && <Button variant="outline" disabled={action.busy} onClick={onRetry}>Retry exact attempt</Button>}
    {notice && (status === "rejected" || status === "superseded") && <Button variant="outline" disabled={action.busy} onClick={onCorrected}>Start corrected attempt</Button>}
  </div>;
}

export function PosMenuControl({ model, bins, channels, targets }: {
  model: PosMenuModel; bins: { id: string; name: string }[]; channels: { id: string; name: string }[];
  targets: { value: string; label: string }[];
}) {
  const command = useCommandAction(), publication = useExactCommand();
  const [savingKey, setSavingKey] = useState<string>();
  const outcome = readPublicationOutcome(publication.result);
  const terminal = isTerminalPublication(outcome?.status);
  const publish = (newAttempt = false, retryConflict = false) => publication.run("publish_pos_menu", { posLocationId: model.selectedLocationId, ...(retryConflict ? { retryConflict: true } : {}) }, newAttempt, model.selectedLocationId);
  return <PosMenuView model={model} bins={bins} channels={channels} targets={targets} busy={command.busy || publication.busy} savingKey={savingKey} error={command.error ?? publication.error} backHref="/more"
    onMap={(row, target) => {
      const [kind, id] = target.split(":", 2);
      setSavingKey(`${row.externalItemId}:${row.externalVariationId}`);
      return command.run("set_pos_item_mapping", {
        externalItemId: row.externalItemId, externalVariationId: row.externalVariationId,
        disposition: kind === "ignore" ? "ignored" : "mapped",
        ...(kind === "sku" ? { skuId: id } : kind === "format" ? { formatId: id } : {}),
      }, undefined, { target: `${row.externalItemId}:${row.externalVariationId}` });
    }}
    notice={<PublicationResult action={publication} onRetry={() => void publish()} onCorrected={() => void publish(true, outcome?.errorCode === "version_mismatch")} />}
    onConfigure={(binId, saleChannelId) => void command.run("configure_pos_menu", { posLocationId: model.selectedLocationId, binId, saleChannelId })}
    onPublish={() => void publish(terminal || publication.failure?.kind === "definitive", outcome?.status === "rejected" && outcome.errorCode === "version_mismatch")} />;
}

export function PosItemControl({ posLocationId, brandId, formatId, item }: {
  posLocationId: string; brandId: string; formatId: string;
  item: Parameters<typeof PosItemView>[0]["item"];
}) {
  const command = useCommandAction(), publication = useExactCommand();
  const outcome = readPublicationOutcome(publication.result);
  const terminal = isTerminalPublication(outcome?.status);
  const publish = (newAttempt = false, retryConflict = false) => publication.run("publish_pos_item", { posLocationId, brandId, ...(retryConflict ? { retryConflict: true } : {}) }, newAttempt, `${posLocationId}:${brandId}`);
  const menuItem = `${posLocationId}:${brandId}:${formatId}`; // Recovery target: one menu item.
  return <PosItemView item={item} busy={command.busy || publication.busy} error={command.error ?? publication.error}
    notice={<PublicationResult action={publication} onRetry={() => void publish()} onCorrected={() => void publish(true, outcome?.errorCode === "version_mismatch")} />}
    onSave={async value => {
      if (await command.run("set_pos_price_override", { posLocationId, formatId, brandId, unitPriceCents: toCents(value) ?? null }, undefined, { target: menuItem }))
        await publish(terminal || publication.failure?.kind === "definitive", outcome?.status === "rejected" && outcome.errorCode === "version_mismatch");
    }}
    onWebsite={published => command.run("set_pos_website_publication", { posLocationId, formatId, brandId, published }, undefined, { target: menuItem })} />;
}
