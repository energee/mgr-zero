import { sentenceCase } from "@/lib/mgr/labels";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { DirectionIcon } from "@/components/mgr/icon";
import type { ComposerEffect } from "@/lib/composer/state";

export type OfflineOutboxRow = {
  id: string;
  label: string;
  status: string;
  retryable?: boolean;
  fixHref?: string;
  fixTo?: string;
};

export function OfflineOutboxView({ rows, busy = false, notice, onDismissNotice, onRetry, onDiscard, onRetryAll, onDiscardAll }: {
  rows: OfflineOutboxRow[];
  /** Why the list may be incomplete, e.g. unreadable entries set aside (#463). */
  notice?: string;
  onDismissNotice?: () => void;
  busy?: boolean;
  onRetry?: (id: string) => void;
  onDiscard?: (id: string) => void;
  onRetryAll?: () => void;
  onDiscardAll?: () => void;
}) {
  const retryable = rows.filter((row) => row.retryable);
  return (
    <section aria-label="Pending readings" className="rounded-md border bg-card p-3 shadow-sm">
      <h2 className="font-medium">Pending readings</h2>
      <p className="mt-1 text-xs text-muted-foreground">Only exact fermentation readings can wait here. Inventory movements, picks, and transfers require a live connection.</p>
      {notice && <div role="alert" className="mt-3">{E.note(<>{notice} {onDismissNotice && <Button type="button" size="sm" variant="ghost" onClick={onDismissNotice}>Dismiss</Button>}</>)}</div>}
      {rows.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No queued readings.</p> : (
        <div className="mt-3 flex flex-col gap-2">{rows.map((row) => (
          <div key={row.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1"><p className="text-sm font-medium">{row.label}</p><p className="text-xs text-muted-foreground">{row.status}</p></div>
            <div className="flex flex-wrap gap-2">
              {row.retryable && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onRetry?.(row.id)}>Retry exact reading</Button>}
              {row.fixHref && <Button asChild size="sm" variant="outline"><Link href={row.fixHref} data-to={row.fixTo}>Fix</Link></Button>}
              <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => onDiscard?.(row.id)}>Discard</Button>
            </div>
          </div>
        ))}</div>
      )}
      {rows.length > 0 && <div className="mt-3 flex flex-wrap justify-end gap-2">
        {retryable.length > 0 && <Button type="button" variant="outline" disabled={busy} onClick={onRetryAll}>Retry {retryable.length} waiting</Button>}
        <Button type="button" variant="destructive" disabled={busy} onClick={onDiscardAll}>Discard {rows.length} queued reading{rows.length === 1 ? "" : "s"}</Button>
      </div>}
    </section>
  );
}

function effectDescription(effect: ComposerEffect) {
  return [
    effect.qty != null && `${effect.qty} unit${effect.qty === "1" || effect.qty === "-1" ? "" : "s"}`,
    effect.bbl != null && `${effect.bbl} bbl`,
    effect.stockBeforeQty != null && effect.stockAfterQty != null && `selected stock ${effect.stockBeforeQty} to ${effect.stockAfterQty}`,
    effect.taxTreatment && `tax: ${sentenceCase(effect.taxTreatment)}`,
    effect.correction && `correction: ${sentenceCase(effect.correction)}`,
  ].filter(Boolean).join(" · ");
}

export function ComposerProposalView({ query, effects, warnings, openHref, openTo, onOpen, onDismiss, onCommit, committing = false, locked = false }: {
  query?: string;
  effects: ComposerEffect[];
  warnings: string[];
  openHref?: string;
  openTo?: string;
  onOpen?: () => void;
  onDismiss?: () => void;
  onCommit?: () => void;
  committing?: boolean;
  locked?: boolean;
}) {
  return (
    <section aria-live="polite" aria-label="Composer proposal" className="rounded-md border bg-card p-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Composer · proposal</p>
      {query && <p className="mt-2 text-sm">“{query}”</p>}
      <div className="mt-2 flex flex-col gap-2">{effects.map((effect, index) => (
        <div key={`${effect.label}:${index}`} className="rounded-md border p-3">
          <p className="text-sm font-medium">{effect.label}</p>
          <p className="text-sm text-muted-foreground">{effectDescription(effect)}</p>
        </div>
      ))}</div>
      {warnings.map((warning) => <Alert key={warning} className="mt-2"><AlertDescription>{warning}</AlertDescription></Alert>)}
      <p className="mt-2 text-xs text-muted-foreground">The server assigns document numbers on commit. Editing any field requires a fresh preview.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
        {openHref && (locked ? <Button type="button" variant="outline" disabled>Open as form <DirectionIcon label="Open" /></Button> : <Button asChild variant="outline"><Link href={openHref} data-to={openTo} onClick={onOpen}>Open as form <DirectionIcon label="Open" /></Link></Button>)}
        <Button type="button" variant="ghost" onClick={onDismiss} disabled={locked}>Dismiss</Button>
        <Button type="button" onClick={onCommit} disabled={!onCommit || committing}>{committing ? "Recording…" : "Commit movement"}</Button>
      </div>
    </section>
  );
}
