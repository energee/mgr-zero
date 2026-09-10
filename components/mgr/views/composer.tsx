import type { ReactNode, Ref } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { DirectionIcon } from "@/components/mgr/icon";
import type { ComposerEffect, ComposerHistoryMessage } from "@/lib/composer/state";

export type ComposerChoice = { value: string; label: string };
export type ComposerStripAction = { value: string; label: string };

export function ComposerStripView({
  portal = false,
  actions = portal
    ? [{ value: "portal_availability", label: "Check account availability" }]
    : [{ value: "record_movement", label: "Record inventory movement" }, { value: "read_atp", label: "Check available to promise" }],
  onAction,
  onHistory,
  actionRef,
}: {
  portal?: boolean;
  actions?: ComposerStripAction[];
  onAction?: (value: string) => void;
  onHistory?: () => void;
  actionRef?: Ref<HTMLSelectElement>;
}) {
  return (
    <InputGroup>
      <select
        ref={actionRef}
        aria-label="Composer action"
        defaultValue=""
        onChange={(event) => { if (event.target.value) onAction?.(event.target.value); event.target.value = ""; }}
        className="min-h-9 flex-1 bg-transparent px-3 text-sm outline-none"
      >
        <option value="">{portal ? "Ask about this account…" : "Choose a supported action…"}</option>
        {actions.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}
      </select>
      <InputGroupAddon align="inline-end">
        <Button type="button" variant="ghost" size="sm" onClick={onHistory}>History</Button>
      </InputGroupAddon>
    </InputGroup>
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

export function ComposerProposalView({ query, effects, warnings, openHref, openTo, onDismiss, onCommit, committing = false }: {
  query?: string;
  effects: ComposerEffect[];
  warnings: string[];
  openHref?: string;
  openTo?: string;
  onDismiss?: () => void;
  onCommit?: () => void;
  committing?: boolean;
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
        {openHref && <Button asChild variant="outline"><Link href={openHref} data-to={openTo}>Open as form <DirectionIcon label="Open" /></Link></Button>}
        <Button type="button" variant="ghost" onClick={onDismiss}>Dismiss</Button>
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
