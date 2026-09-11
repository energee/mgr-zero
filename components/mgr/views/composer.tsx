import type { ReactNode, Ref } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { DirectionIcon } from "@/components/mgr/icon";
import type { ComposerEffect, ComposerHistoryMessage, MovementDraft, MovementKind } from "@/lib/composer/state";

export type ComposerChoice = { value: string; label: string };
export type ComposerStripAction = { value: string; label: string };
export type ComposerPickerOption = { id: string; label: string };
export type OfflineOutboxRow = {
  id: string;
  label: string;
  status: string;
  retryable?: boolean;
  fixHref?: string;
  fixTo?: string;
};

const MOVEMENT_TYPES: { value: MovementKind; label: string }[] = [
  { value: "opening_balance", label: "Opening balance" },
  { value: "production_in", label: "Production in" },
  { value: "adjustment", label: "Adjustment" },
  { value: "depletion", label: "Depletion" },
  { value: "return_in", label: "Return in" },
  { value: "destruction", label: "Destruction" },
  { value: "loss", label: "Loss" },
  { value: "sample", label: "Sample" },
  { value: "festival_removal", label: "Festival removal" },
];

export function ComposerMovementPickerView({ draft, skus, locations, bins, lots, channels, busy = false, disabled = false, question = true, proposal = false, onChange, onPreview }: {
  draft: MovementDraft;
  skus: ComposerPickerOption[];
  locations: ComposerPickerOption[];
  bins: ComposerPickerOption[];
  lots: ComposerPickerOption[];
  channels: ComposerPickerOption[];
  busy?: boolean;
  disabled?: boolean;
  question?: boolean;
  proposal?: boolean;
  onChange?: (patch: Partial<MovementDraft>) => void;
  onPreview?: () => void;
}) {
  return (
    <section className="grid gap-2 rounded-md border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
      <Label>SKU / package<select disabled={disabled} className="mt-1 w-full rounded-md border bg-background p-2" value={draft.skuId ?? ""} onChange={(event) => onChange?.({ skuId: event.target.value || undefined, lotChoice: undefined })}><option value="">Choose…</option>{skus.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Label>
      <Label>Type<select disabled={disabled} className="mt-1 w-full rounded-md border bg-background p-2" value={draft.kind ?? ""} onChange={(event) => onChange?.({ kind: (event.target.value || undefined) as MovementKind | undefined, direction: undefined, saleChannelId: undefined, destState: undefined })}><option value="">Choose…</option>{MOVEMENT_TYPES.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></Label>
      {draft.kind === "adjustment" && <Label>Direction<select disabled={disabled} className="mt-1 w-full rounded-md border bg-background p-2" value={draft.direction ?? ""} onChange={(event) => onChange?.({ direction: (event.target.value || undefined) as "add" | "remove" | undefined })}><option value="">Choose…</option><option value="add">Add stock</option><option value="remove">Remove stock</option></select></Label>}
      <Label>Location<select disabled={disabled} className="mt-1 w-full rounded-md border bg-background p-2" value={draft.locationId ?? ""} onChange={(event) => onChange?.({ locationId: event.target.value || undefined, binId: undefined, lotChoice: undefined })}><option value="">Choose…</option>{locations.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Label>
      <Label>Bin<select className="mt-1 w-full rounded-md border bg-background p-2" value={draft.binId ?? ""} disabled={disabled || !draft.locationId} onChange={(event) => onChange?.({ binId: event.target.value || undefined, lotChoice: undefined })}><option value="">Choose…</option>{bins.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Label>
      <Label>Lot<select className="mt-1 w-full rounded-md border bg-background p-2" value={draft.lotChoice ?? ""} disabled={disabled || !draft.binId || !draft.skuId} onChange={(event) => onChange?.({ lotChoice: event.target.value || undefined })}><option value="">Choose…</option><option value="untracked">Untracked / legacy stock</option>{lots.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Label>
      <Label>Positive quantity<Input disabled={disabled} className="mt-1" type="number" min="0.01" step="0.01" value={draft.qty ?? ""} onChange={(event) => onChange?.({ qty: event.target.value })} /></Label>
      {draft.kind === "depletion" && <Label>Sale channel<select disabled={disabled} className="mt-1 w-full rounded-md border bg-background p-2" value={draft.saleChannelId ?? ""} onChange={(event) => onChange?.({ saleChannelId: event.target.value || undefined })}><option value="">Choose…</option>{channels.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Label>}
      {(draft.kind === "sample" || draft.kind === "festival_removal") && <Label>Destination state<Input disabled={disabled} className="mt-1" maxLength={2} pattern="[A-Za-z]{2}" value={draft.destState ?? ""} onChange={(event) => onChange?.({ destState: event.target.value.toUpperCase() })} /></Label>}
      <Label className="sm:col-span-2">Note<Input disabled={disabled} className="mt-1" value={draft.note ?? ""} onChange={(event) => onChange?.({ note: event.target.value })} /></Label>
      <div className="flex items-end"><Button type="button" disabled={disabled || busy || question} onClick={onPreview}>{busy ? "Loading…" : proposal ? "Preview current data" : "Preview movement"}</Button></div>
    </section>
  );
}

export function ComposerStripView({
  actions = [{ value: "record_movement", label: "Record inventory movement" }, { value: "read_atp", label: "Check available to promise" }],
  onAction,
  onHistory,
  onOutbox,
  outboxCount = 0,
  disabled = false,
  actionRef,
}: {
  actions?: ComposerStripAction[];
  onAction?: (value: string) => void;
  onHistory?: () => void;
  onOutbox?: () => void;
  outboxCount?: number;
  disabled?: boolean;
  actionRef?: Ref<HTMLSelectElement>;
}) {
  return (
    <InputGroup>
      <select
        ref={actionRef}
        aria-label="Composer action"
        disabled={disabled}
        defaultValue=""
        onChange={(event) => { if (event.target.value) onAction?.(event.target.value); event.target.value = ""; }}
        className="min-h-9 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
      >
        <option value="">Choose a supported action…</option>
        {actions.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}
      </select>
      <InputGroupAddon align="inline-end">
        <Button type="button" variant="ghost" size="sm" onClick={onOutbox}>Outbox{outboxCount ? ` (${outboxCount})` : ""}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onHistory}>History</Button>
      </InputGroupAddon>
    </InputGroup>
  );
}

export function OfflineOutboxView({ rows, busy = false, onRetry, onDiscard, onRetryAll, onDiscardAll }: {
  rows: OfflineOutboxRow[];
  busy?: boolean;
  onRetry?: (id: string) => void;
  onDiscard?: (id: string) => void;
  onRetryAll?: () => void;
  onDiscardAll?: () => void;
}) {
  const retryable = rows.filter((row) => row.retryable);
  return (
    <section aria-label="Offline outbox" className="rounded-md border bg-card p-3 shadow-sm">
      <h2 className="font-medium">Offline outbox</h2>
      <p className="mt-1 text-xs text-muted-foreground">Only exact fermentation readings can wait here. Inventory movements, picks, and transfers require a live connection.</p>
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

export function ComposerQuestionView({ query, prompt, choices = [], children }: {
  query?: string;
  prompt: string;
  choices?: ComposerChoice[];
  children?: ReactNode;
}) {
  return (
    <section aria-live="polite" aria-label="Composer question" className="rounded-md border bg-card p-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Composer · question</p>
      {query && <p className="mt-2 text-sm">“{query}”</p>}
      <h2 className="mt-2 font-medium">{prompt}</h2>
      {choices.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{choices.map((choice) => (
        <Button key={choice.value} type="button" variant="outline" size="sm">{choice.label}</Button>
      ))}</div>}
      {children}
      <p className="mt-2 text-xs text-muted-foreground">Nothing is recorded until a canonical proposal is previewed and its verb is selected.</p>
    </section>
  );
}

function effectDescription(effect: ComposerEffect) {
  return [
    effect.qty != null && `${effect.qty} unit${effect.qty === "1" || effect.qty === "-1" ? "" : "s"}`,
    effect.bbl != null && `${effect.bbl} bbl`,
    effect.stockBeforeQty != null && effect.stockAfterQty != null && `selected stock ${effect.stockBeforeQty} to ${effect.stockAfterQty}`,
    effect.taxTreatment && `tax: ${effect.taxTreatment.replaceAll("_", " ")}`,
    effect.correction && `correction: ${effect.correction.replaceAll("_", " ")}`,
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

export function ComposerAnswerView({ query, answer, detail, observedAt }: {
  query: string;
  answer: string;
  detail?: string;
  observedAt: string;
}) {
  return (
    <section aria-live="polite" aria-label="Composer answer" className="rounded-md border bg-card p-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Composer · answer</p>
      <p className="mt-2 text-sm">“{query}”</p>
      <p className="mt-2 text-lg font-semibold">{answer}</p>
      {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
      <p className="mt-2 text-xs text-muted-foreground">Observed {observedAt}</p>
    </section>
  );
}

export function ComposerHistoryView({ messages, onClose }: { messages: ComposerHistoryMessage[]; onClose?: () => void }) {
  return (
    <section aria-label="Composer history" className="max-h-64 overflow-y-auto rounded-md border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between"><h2 className="font-medium">History</h2><Button type="button" variant="ghost" size="sm" onClick={onClose}>Close</Button></div>
      {messages.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No conversation history yet.</p> : (
        <ol className="mt-2 space-y-2">{messages.map((message) => (
          <li key={message.id} className="text-sm">
            <span className="font-medium">{message.role === "result" ? "Recorded" : message.role === "user" ? "You" : "MGR"}</span>
            {message.content && <span> · {message.content}</span>}
            <span className="block text-xs text-muted-foreground">{new Date(message.created_at).toLocaleString()}</span>
          </li>
        ))}</ol>
      )}
    </section>
  );
}
