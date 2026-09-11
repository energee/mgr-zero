import type { ReactNode, Ref } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
export type ComposerConversationMessage = { id: string; role: "user" | "assistant"; content: string };

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

export function ComposerMovementPickerView({ draft, skus, locations, bins, lots, channels, field, busy = false, disabled = false, question = true, proposal = false, onChange, onPreview }: {
  draft: MovementDraft;
  skus: ComposerPickerOption[];
  locations: ComposerPickerOption[];
  bins: ComposerPickerOption[];
  lots: ComposerPickerOption[];
  channels: ComposerPickerOption[];
  field?: "skuId" | "kind" | "direction" | "locationId" | "binId" | "lotChoice" | "qty" | "saleChannelId" | "destState";
  busy?: boolean;
  disabled?: boolean;
  question?: boolean;
  proposal?: boolean;
  onChange?: (patch: Partial<MovementDraft>) => void;
  onPreview?: () => void;
}) {
  return (
    <div className="mt-3">
      {field === "skuId" && <Label>SKU / package<select disabled={disabled} className="mt-1 w-full rounded-md border bg-background p-2" value={draft.skuId ?? ""} onChange={(event) => onChange?.({ skuId: event.target.value || undefined, lotChoice: undefined })}><option value="">Choose…</option>{skus.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Label>}
      {field === "kind" && <Label>Type<select disabled={disabled} className="mt-1 w-full rounded-md border bg-background p-2" value={draft.kind ?? ""} onChange={(event) => onChange?.({ kind: (event.target.value || undefined) as MovementKind | undefined, direction: undefined, saleChannelId: undefined, destState: undefined })}><option value="">Choose…</option>{MOVEMENT_TYPES.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></Label>}
      {field === "direction" && <Label>Direction<select disabled={disabled} className="mt-1 w-full rounded-md border bg-background p-2" value={draft.direction ?? ""} onChange={(event) => onChange?.({ direction: (event.target.value || undefined) as "add" | "remove" | undefined })}><option value="">Choose…</option><option value="add">Add stock</option><option value="remove">Remove stock</option></select></Label>}
      {field === "locationId" && <Label>Location<select disabled={disabled} className="mt-1 w-full rounded-md border bg-background p-2" value={draft.locationId ?? ""} onChange={(event) => onChange?.({ locationId: event.target.value || undefined, binId: undefined, lotChoice: undefined })}><option value="">Choose…</option>{locations.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Label>}
      {field === "binId" && <Label>Bin<select className="mt-1 w-full rounded-md border bg-background p-2" value={draft.binId ?? ""} disabled={disabled || !draft.locationId} onChange={(event) => onChange?.({ binId: event.target.value || undefined, lotChoice: undefined })}><option value="">Choose…</option>{bins.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Label>}
      {field === "lotChoice" && <Label>Lot<select className="mt-1 w-full rounded-md border bg-background p-2" value={draft.lotChoice ?? ""} disabled={disabled || !draft.binId || !draft.skuId} onChange={(event) => onChange?.({ lotChoice: event.target.value || undefined })}><option value="">Choose…</option><option value="untracked">Untracked / legacy stock</option>{lots.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Label>}
      {field === "qty" && <Label>Positive quantity<Input disabled={disabled} className="mt-1" type="number" min="0.01" step="0.01" value={draft.qty ?? ""} onChange={(event) => onChange?.({ qty: event.target.value })} /></Label>}
      {field === "saleChannelId" && <Label>Sale channel<select disabled={disabled} className="mt-1 w-full rounded-md border bg-background p-2" value={draft.saleChannelId ?? ""} onChange={(event) => onChange?.({ saleChannelId: event.target.value || undefined })}><option value="">Choose…</option>{channels.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Label>}
      {field === "destState" && <Label>Destination state<Input disabled={disabled} className="mt-1" maxLength={2} pattern="[A-Za-z]{2}" value={draft.destState ?? ""} onChange={(event) => onChange?.({ destState: event.target.value.toUpperCase() })} /></Label>}
      {!question && <div className="flex items-end"><Button type="button" disabled={disabled || busy} onClick={onPreview}>{busy ? "Loading…" : proposal ? "Preview current data" : "Preview movement"}</Button></div>}
    </div>
  );
}

export function ComposerStripView({
  actions = [{ value: "attention", label: "What needs attention?" }, { value: "inventory", label: "Check inventory" }, { value: "movement", label: "Record a movement" }],
  onAction,
  onHistory,
  onOutbox,
  outboxCount = 0,
  disabled = false,
  promptRef,
  value,
  onChange,
  onSubmit,
  streaming = false,
  onStop,
}: {
  actions?: ComposerStripAction[];
  onAction?: (value: string) => void;
  onHistory?: () => void;
  onOutbox?: () => void;
  outboxCount?: number;
  disabled?: boolean;
  promptRef?: Ref<HTMLTextAreaElement>;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  streaming?: boolean;
  onStop?: () => void;
}) {
  return (
    <div className="rounded-2xl border bg-card p-2 shadow-lg">
      <form onSubmit={onSubmit ? (event) => { event.preventDefault(); const message = value?.trim(); if (message) onSubmit(message); } : undefined}>
        <InputGroup className="h-auto rounded-xl border-0 bg-muted/40 shadow-none">
          <Textarea
            ref={promptRef}
            aria-label="Ask MGR"
            placeholder="Ask MGR about inventory, orders, production…"
            disabled={disabled}
            value={value}
            onChange={onChange ? (event) => onChange(event.target.value) : undefined}
            rows={2}
            maxLength={4000}
            className="min-h-14 resize-none border-0 bg-transparent px-3 py-2 shadow-none focus-visible:ring-0"
            onKeyDown={onSubmit ? (event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                const message = value?.trim();
                if (message) onSubmit(message);
              }
            } : undefined}
          />
          <InputGroupAddon align="block-end" className="flex-col items-stretch gap-1 px-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex flex-wrap gap-1">
              {actions.map((action) => <Button key={action.value} type="button" variant="ghost" size="sm" disabled={disabled} onClick={onAction ? () => onAction(action.value) : undefined}>{action.label}</Button>)}
            </span>
            <span className="flex flex-wrap items-center justify-end gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={onOutbox}>Outbox{outboxCount ? ` (${outboxCount})` : ""}</Button>
              <Button type="button" variant="ghost" size="sm" onClick={onHistory}>History</Button>
              <span className="text-xs text-muted-foreground">Enter to send · Shift + Enter for a new line</span>
              {streaming
                ? <Button type="button" size="sm" variant="outline" onClick={onStop}>Stop response</Button>
                : <Button type="submit" size="sm" disabled={disabled || !value?.trim()}>Send</Button>}
            </span>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}

export function ComposerConversationView({ messages, activity, error, onRetry, onNewChat, onMinimize }: {
  messages: ComposerConversationMessage[];
  activity?: string;
  error?: string;
  onRetry?: () => void;
  onNewChat?: () => void;
  onMinimize?: () => void;
}) {
  return (
    <section aria-label="MGR conversation" className="overflow-hidden rounded-2xl border bg-card shadow-xl">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div><h2 className="font-semibold">Ask MGR</h2><p className="text-xs text-muted-foreground">Answers use your brewery data and permissions.</p></div>
        <div className="flex gap-1"><Button type="button" size="sm" variant="ghost" onClick={onNewChat}>New chat</Button><Button type="button" size="sm" variant="ghost" onClick={onMinimize}>Minimize</Button></div>
      </header>
      <div role="log" aria-live="polite" className="max-h-[28rem] space-y-3 overflow-y-auto p-4">
        {messages.map((message) => <div key={message.id} className={message.role === "user" ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground" : "max-w-[90%] whitespace-pre-wrap text-sm"}><span className="sr-only">{message.role === "user" ? "You" : "MGR"}: </span>{message.content}</div>)}
        {activity && <p className="text-sm text-muted-foreground">{activity}</p>}
        {error && <Alert><AlertDescription className="flex items-center justify-between gap-3"><span>{error}</span><Button type="button" size="sm" variant="outline" onClick={onRetry}>Try again</Button></AlertDescription></Alert>}
      </div>
    </section>
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
    <section aria-live="polite" aria-label="Composer question" className="max-w-xl rounded-2xl rounded-tl-sm border bg-card p-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">MGR</p>
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
