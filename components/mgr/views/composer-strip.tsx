import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";

export type ComposerStripAction = { value: string; label: string };

/** Enter sends; Shift+Enter is a new line, and Enter that confirms an IME
 * candidate (Japanese, Chinese…) is the IME's, not a send. */
export const isSendKey = (event: { key: string; shiftKey: boolean; nativeEvent: { isComposing: boolean } }) =>
  event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing;

export function ComposerStripView({
  actions = [{ value: "attention", label: "What needs attention?" }, { value: "inventory", label: "Check inventory" }, { value: "movement", label: "Record a movement" }],
  onAction,
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
      <form className="shrink-0" onSubmit={onSubmit ? (event) => { event.preventDefault(); const message = value?.trim(); if (message) onSubmit(message); } : undefined}>
        <InputGroup className="h-auto rounded-xl border-0 bg-muted/40 shadow-none">
          <InputGroupTextarea
            ref={promptRef}
            aria-label="Ask MGR"
            placeholder="Ask MGR about inventory, orders, production…"
            disabled={disabled}
            value={value}
            onChange={onChange ? (event) => onChange(event.target.value) : undefined}
            rows={2}
            maxLength={4000}
            className="min-h-14 px-3"
            onKeyDown={onSubmit ? (event) => {
              if (isSendKey(event)) {
                event.preventDefault();
                const message = value?.trim();
                if (message) onSubmit(message);
              }
            } : undefined}
          />
          <InputGroupAddon align="block-end" className="flex-col items-stretch gap-1 px-2 pb-2">
            <span className="flex flex-wrap gap-1">
              {actions.map((action) => <Button key={action.value} type="button" variant="ghost" size="sm" disabled={disabled} onClick={onAction ? () => onAction(action.value) : undefined}>{action.label}</Button>)}
            </span>
            <span className="flex flex-wrap items-center justify-end gap-1">
              <Button type="button" variant="ghost" size="sm" className="mr-auto" onClick={onOutbox}>Outbox{outboxCount ? ` (${outboxCount})` : ""}</Button>
              <span className="hidden text-xs text-muted-foreground md:inline">Enter to send · Shift + Enter for a new line</span>
              {streaming
                ? <Button type="button" size="sm" variant="outline" onClick={onStop}>Stop response</Button>
                : <Button type="submit" size="sm" disabled={disabled || !value?.trim()}>Send</Button>}
            </span>
          </InputGroupAddon>
        </InputGroup>
      </form>
  );
}
