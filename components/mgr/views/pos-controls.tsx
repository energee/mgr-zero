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
import { isTerminalPublication, publicationNotice, readPublicationOutcome, shouldStartNewCommandAttempt, syncFailureMessage, type PosLocationRow, type PosMenuModel, type PosSaleRow, type PosVariationRow } from "@/lib/mgr/pos-view";

function useExactCommand() {
  const action = useCommandAction();
  const [requestId, setRequestId] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  async function run(name: string, input: unknown, corrected = false) {
    const id = !corrected && requestId ? requestId : crypto.randomUUID();
    setRequestId(id); setResult(null);
    const ok = await action.run(name, input, data => setResult(data as Record<string, unknown>), id);
    return { ok, requestId: id };
  }
  return { ...action, requestId, result, run, clear: () => { setRequestId(null); setResult(null); action.setError(null); } };
}

export function PosRouteSheet({ title, backHref, children }: { title: string; backHref: string; children: ReactNode }) {
  const router = useRouter();
  return <CommandForm open onOpenChange={open => { if (!open) router.push(backHref); }} title={title}><div className="flex flex-col gap-2">{children}</div></CommandForm>;
}

export function SquareConnectControl({ configured, reconnect = false }: { configured: boolean; reconnect?: boolean }) {
  const action = useCommandAction();
  return <ConnectSquareView configured={configured} busy={action.busy} error={action.error} live onConnect={() => void action.run("connect_square", { reconnect }, data => location.assign((data as { authorizeUrl: string }).authorizeUrl))} />;
}

export function SquareDisconnectControl({ connectionId }: { connectionId: string }) {
  const action = useCommandAction(), router = useRouter();
  return <DisconnectSquareView busy={action.busy} error={action.error} onDisconnect={() => void action.run("disconnect_square", { connectionId }, () => router.push("/settings/pos/connect"))} />;
}

export function SquareSyncControls() {
  const catalog = useExactCommand(), sales = useExactCommand();
  const summary = (kind: string, action: ReturnType<typeof useExactCommand>) => {
    if (action.result) return E.info(`${kind} sync complete · attempt ${action.requestId}`);
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
    onSave={(row, mgrLocationId) => void action.run("set_pos_location_mapping", { posLocationId: row.externalLocationId, mgrLocationId })} />;
}

export function PosMappingControl({ variations, targets, sales, coverage, canSync }: {
  variations: PosVariationRow[]; targets: { value: string; label: string }[]; sales: PosSaleRow[]; coverage: string[];
  canSync: boolean;
}) {
  const action = useCommandAction();
  return <PosMappingView variations={variations} targets={targets} sales={sales} coverage={coverage} busy={action.busy} error={action.error} live
    syncAction={canSync ? <SquareSyncControls /> : undefined} onSave={(row, target) => {
      const [kind, id] = target.split(":", 2);
      void action.run("set_pos_item_mapping", {
        externalItemId: row.externalItemId, externalVariationId: row.externalVariationId,
        disposition: kind === "ignore" ? "ignored" : "mapped",
        ...(kind === "sku" ? { skuId: id } : kind === "format" ? { formatId: id } : {}),
      });
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
  const publish = (newAttempt = false, retryConflict = false) => publication.run("publish_pos_menu", { posLocationId: model.selectedLocationId, ...(retryConflict ? { retryConflict: true } : {}) }, newAttempt);
  return <PosMenuView model={model} bins={bins} channels={channels} busy={command.busy || publication.busy} error={command.error ?? publication.error} live
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
  const publish = (newAttempt = false, retryConflict = false) => publication.run("publish_pos_item", { posLocationId, brandId, ...(retryConflict ? { retryConflict: true } : {}) }, newAttempt);
  return <PosItemView item={item} busy={command.busy || publication.busy} error={command.error ?? publication.error}
    notice={<PublicationResult action={publication} onRetry={() => void publish()} onCorrected={() => void publish(true, outcome?.errorCode === "version_mismatch")} />}
    onSave={value => void command.run("set_pos_price_override", { posLocationId, formatId, unitPriceCents: value === "" ? null : Math.round(Number(value) * 100) })}
    onWebsite={published => command.run("set_pos_website_publication", { posLocationId, formatId, published })}
    onPublish={() => void publish(terminal || publication.failure?.kind === "definitive", outcome?.status === "rejected" && outcome.errorCode === "version_mismatch")} />;
}
