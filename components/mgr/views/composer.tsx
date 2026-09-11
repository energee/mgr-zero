import type { ReactNode, Ref } from "react";
import Link from "next/link";
import { Streamdown } from "streamdown";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { DirectionIcon } from "@/components/mgr/icon";
import type { ComposerEffect } from "@/lib/composer/state";

export type ComposerStripAction = { value: string; label: string };
export type OfflineOutboxRow = {
  id: string;
  label: string;
  status: string;
  retryable?: boolean;
  fixHref?: string;
  fixTo?: string;
};
export type ComposerConversationMessage = { id: string; role: "user" | "assistant"; content: string };

export function ComposerDrawerView({ children, open, onOpenChange }: {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>
        <Button type="button" variant="outline" aria-label="Open Ask MGR" className="h-auto w-full justify-between rounded-xl px-4 py-3 text-left shadow-sm">
          <span><span className="block font-semibold">Ask MGR</span><span className="block text-xs font-normal text-muted-foreground">Chat with your brewery data</span></span>
          <span aria-hidden="true" className="text-muted-foreground">⌃</span>
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader className="sr-only">
          <DrawerTitle>Ask MGR</DrawerTitle>
          <DrawerDescription>Chat with your brewery data and complete work in MGR.</DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-y-auto p-3 pt-2 sm:p-4">{children}</div>
      </DrawerContent>
    </Drawer>
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

export function ComposerConversationView({ messages, model, activity, error, onRetry, onNewChat, onMinimize }: {
  messages: ComposerConversationMessage[];
  model?: string;
  activity?: string;
  error?: string;
  onRetry?: () => void;
  onNewChat?: () => void;
  onMinimize?: () => void;
}) {
  return (
    <section aria-label="MGR conversation" className="overflow-hidden rounded-2xl border bg-card shadow-xl">
      <header className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-semibold">Ask MGR</h2><p className="text-xs text-muted-foreground">Answers use your brewery data and permissions.{model ? ` · ${model}` : ""}</p></div>
        <div className="flex gap-1"><Button type="button" size="sm" variant="ghost" onClick={onNewChat}>New chat</Button><Button type="button" size="sm" variant="ghost" onClick={onMinimize}>Minimize</Button></div>
      </header>
      <div role="log" aria-live="polite" className="max-h-[28rem] space-y-3 overflow-y-auto p-4">
        {messages.map((message) => <div key={message.id} className={message.role === "user" ? "ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground" : "max-w-[90%] text-sm"}><span className="sr-only">{message.role === "user" ? "You" : "MGR"}: </span>{message.role === "assistant" ? <Streamdown>{message.content}</Streamdown> : message.content}</div>)}
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
