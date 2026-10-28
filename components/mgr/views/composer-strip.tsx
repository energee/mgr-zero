import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { MAX_CHAT_MESSAGE_CHARS } from "@/lib/chat/messages";

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
  disabledReason,
  promptRef,
  value,
  onChange,
  onSubmit,
  streaming = false,
  onStop,
}: {
  actions?: ComposerStripAction[];
  onAction?: (value: string) => void;
  /** Opens Pending readings. Left out, the strip draws no Pending readings
   *  button: Composer passes it only while there is a reading or a notice to show. */
  onOutbox?: () => void;
  outboxCount?: number;
  disabled?: boolean;
  /** Why the box is disabled, shown in the box itself (#1520). */
  disabledReason?: string;
  promptRef?: Ref<HTMLTextAreaElement>;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  streaming?: boolean;
  onStop?: () => void;
}) {
  // No maxLength: the browser would cut a long paste silently. A longer
  // prompt stays as typed, says it is over the limit, and cannot be sent (#1520).
  const length = value?.length ?? 0;
  const tooLong = length > MAX_CHAT_MESSAGE_CHARS;
  const send = () => { const message = value?.trim(); if (message && !tooLong) onSubmit?.(message); };
  return (
      <form className="shrink-0" onSubmit={onSubmit ? (event) => { event.preventDefault(); send(); } : undefined}>
        <InputGroup className="h-auto rounded-xl border-0 bg-muted/40 shadow-none">
          <InputGroupTextarea
            ref={promptRef}
            aria-label="Ask MGR"
            placeholder={disabledReason ?? "Ask MGR about inventory, orders, production…"}
            disabled={disabled}
            value={value}
            onChange={onChange ? (event) => onChange(event.target.value) : undefined}
            rows={2}
            aria-invalid={tooLong || undefined}
            className="min-h-14 px-3"
            onKeyDown={onSubmit ? (event) => {
              if (isSendKey(event)) {
                event.preventDefault();
                send();
              }
            } : undefined}
          />
          <InputGroupAddon align="block-end" className="flex-col items-stretch gap-1 px-2 pb-2">
            <span className="flex flex-wrap gap-1">
              {actions.map((action) => <Button key={action.value} type="button" variant="ghost" size="sm" disabled={disabled} onClick={onAction ? () => onAction(action.value) : undefined}>{action.label}</Button>)}
            </span>
            <span className="flex flex-wrap items-center justify-end gap-1">
              <span className="hidden text-xs text-muted-foreground md:inline">Enter to send · Shift + Enter for a new line</span>
              {streaming
                ? <Button type="button" size="sm" variant="outline" onClick={onStop}>Stop response</Button>
                : <Button type="submit" size="sm" disabled={disabled || tooLong || !value?.trim()}>Send</Button>}
            </span>
            {tooLong && <span role="alert" className="text-xs text-destructive">{`${length.toLocaleString("en-US")} / ${MAX_CHAT_MESSAGE_CHARS.toLocaleString("en-US")} characters. Shorten your message to send it.`}</span>}
          </InputGroupAddon>
        </InputGroup>
        {onOutbox && <div className="flex flex-wrap items-center gap-x-1 px-1 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onOutbox}>Pending readings ({outboxCount})</Button>
          <span className="text-xs text-muted-foreground">Saved fermentation readings to retry or review.</span>
        </div>}
      </form>
  );
}
