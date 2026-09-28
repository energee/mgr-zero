"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CommandForm } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import {
  ConnectSquareView, DisconnectSquareView, PosItemView, PosMappingView, PosMenuView, PosSyncActions, SquareLocationsView,
} from "@/components/mgr/views/pos";
import { Button } from "@/components/ui/button";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { revocationConfirmed } from "@/lib/mgr/integration-disconnect";
import { isTerminalPublication, publicationNotice, readPublicationOutcome, selectExactCommandAttempt, shouldStartNewCommandAttempt, syncFailureMessage, syncResultMessage, type ExactCommandAttempt, type PosLocationRow, type PosMenuModel, type PosSaleRow, type PosVariationRow } from "@/lib/mgr/pos-view";

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
  return <ConnectSquareView configured={configured} busy={action.busy} error={action.error} backHref="/settings/pos" onConnect={() => void action.run("connect_square", { reconnect }, data => location.assign((data as { authorizeUrl: string }).authorizeUrl))} />;
}

/** Leaves for Connect only when Square confirmed revocation; otherwise refreshes so the page shows the unresolved outcome. */
export function SquareDisconnectControl({ connectionId }: { connectionId: string }) {
  const action = useCommandAction(), router = useRouter();
  return <DisconnectSquareView busy={action.busy} error={action.error}
    onDisconnect={() => void action.run("disconnect_square", { connectionId }, data => revocationConfirmed(data) ? router.push("/settings/pos/connect") : router.refresh(), { refresh: false })} />;
}

export function SquareSyncControls() {
  const catalog = useExactCommand(), sales = useExactCommand();
  const summary = (kind: string, action: ReturnType<typeof useExactCommand>) => {
    const result = syncResultMessage(kind, action.result, action.requestId);
    if (result) return action.result && (action.result as Record<string, unknown>).superseded === true ? E.note(result) : E.info(result);
    const message = syncFailureMessage(kind, action.failure, action.requestId);
    return message ? E.note(message) : null;
  };
  return <PosSyncActions catalogBusy={catalog.busy} salesBusy={sales.busy}
    catalogLabel={catalog.failure?.kind === "unknown" ? "Retry exact catalog sync" : "Sync Square catalog"}
    salesLabel={sales.failure?.kind === "unknown" ? "Retry exact sales sync" : "Sync Square sales"}
    onCatalog={() => void catalog.run("sync_square_catalog", {}, shouldStartNewCommandAttempt(catalog.result, catalog.failure))}
    onSales={() => void sales.run("sync_square_sales", {}, shouldStartNewCommandAttempt(sales.result, sales.failure))}
    feedback={<>{summary("Catalog", catalog)}{summary("Sales", sales)}</>} />;
}

export function SquareLocationsControl({ rows, locations }: { rows: PosLocationRow[]; locations: { id: string; name: string }[] }) {
  const action = useCommandAction();
  return <SquareLocationsView rows={rows} locations={locations} busy={action.busy} error={action.error}
    onSave={(row, mgrLocationId) => void action.run("set_pos_location_mapping", { posLocationId: row.externalLocationId, mgrLocationId }, undefined, { target: row.externalLocationId })} />;
}

export function PosMappingControl({ variations, targets, sales, coverage, canSync, back }: {
  variations: PosVariationRow[]; targets: { value: string; label: string }[]; sales: PosSaleRow[]; coverage: string[];
  canSync: boolean; back: { href: string; label: string };
}) {
  const action = useCommandAction();
  return <PosMappingView variations={variations} targets={targets} sales={sales} coverage={coverage} busy={action.busy} error={action.error} backHref={back.href} backLabel={back.label}
    syncAction={canSync ? <SquareSyncControls /> : undefined} onSave={(row, target) => {
      const [kind, id] = target.split(":", 2);
      void action.run("set_pos_item_mapping", {
        externalItemId: row.externalItemId, externalVariationId: row.externalVariationId,
        disposition: kind === "ignore" ? "ignored" : "mapped",
        ...(kind === "sku" ? { skuId: id } : kind === "format" ? { formatId: id } : {}),
      }, undefined, { target: `${row.externalItemId}:${row.externalVariationId}` });
    }} />;
}

function PublicationResult({ action, onRetry, onCorrected }: { action: ReturnType<typeof useExactCommand>; onRetry: () => void; onCorrected: () => void }) {
  if (!action.requestId) return null;
  const outcome = readPublicationOutcome(action.result);
  if (!outcome && action.failure?.kind !== "unknown") return null;
  const status = outcome?.status ?? "prepared";
  const notice = publicationNotice({ requestId: outcome?.attemptId ?? action.requestId, status, errorCode: outcome?.errorCode });
  return <div className="flex flex-col gap-2">
    {notice.tone === "success" ? E.info(`${notice.label} · ${notice.detail}`) : E.note(`${notice.label} · ${notice.detail}`)}
    {notice.retry && <Button variant="outline" disabled={action.busy} onClick={onRetry}>Retry exact attempt</Button>}
    {(status === "rejected" || status === "superseded") && <Button variant="outline" disabled={action.busy} onClick={onCorrected}>Start corrected attempt</Button>}
  </div>;
}

export function PosMenuControl({ model, bins, channels }: {
  model: PosMenuModel; bins: { id: string; name: string }[]; channels: { id: string; name: string }[];
}) {
  const command = useCommandAction(), publication = useExactCommand();
  const outcome = readPublicationOutcome(publication.result);
  const terminal = isTerminalPublication(outcome?.status);
  const publish = (newAttempt = false, retryConflict = false) => publication.run("publish_pos_menu", { posLocationId: model.selectedLocationId, ...(retryConflict ? { retryConflict: true } : {}) }, newAttempt, model.selectedLocationId);
  return <PosMenuView model={model} bins={bins} channels={channels} busy={command.busy || publication.busy} error={command.error ?? publication.error} backHref="/more"
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
    onSave={value => void command.run("set_pos_price_override", { posLocationId, formatId, brandId, unitPriceCents: value === "" ? null : Math.round(Number(value) * 100) }, undefined, { target: menuItem })}
    onWebsite={published => command.run("set_pos_website_publication", { posLocationId, formatId, brandId, published }, undefined, { target: menuItem })}
    onPublish={() => void publish(terminal || publication.failure?.kind === "definitive", outcome?.status === "rejected" && outcome.errorCode === "version_mismatch")} />;
}
