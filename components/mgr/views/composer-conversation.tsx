import type { ReactNode } from "react";
import { Streamdown } from "streamdown";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

const DISALLOWED_ELEMENTS = ["img"];

/** Work in progress (setup, thinking, responding): a pulsing bar beside the
 *  text, so a long wait reads as progress rather than a stuck page (#1105). */
export function ComposerActivity({ children }: { children: ReactNode }) {
  return <div className="flex items-start gap-2 text-sm text-muted-foreground"><Skeleton aria-hidden className="mt-1.5 h-2 w-10 shrink-0 rounded-full bg-primary/40 motion-reduce:animate-none" /><p>{children}</p></div>;
}

export type ComposerConversationMessage = { id: string; role: "user" | "assistant"; content: string };

export function ComposerConversationView({ messages, activity, error, onRetry, onNewChat, onSetupRetry }: {
  messages: ComposerConversationMessage[];
  activity?: string;
  error?: string;
  onRetry?: () => void;
  onNewChat?: () => void;
  onSetupRetry?: () => void;
}) {
  return (
    <section aria-label="MGR conversation" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-2 px-1 py-2 sm:items-center">
        <p className="text-xs text-muted-foreground">Answers use your brewery data and permissions.</p>
        <Button type="button" size="sm" variant="ghost" onClick={onSetupRetry ?? onNewChat}>{onSetupRetry ? "Retry setup" : "New chat"}</Button>
      </header>
      <div role="log" aria-live="polite" className="flex min-h-40 flex-1 flex-col gap-4 overflow-y-auto px-1 py-3">
        {messages.length === 0 && !activity && !error && <Empty><EmptyHeader><EmptyTitle>What can MGR help with?</EmptyTitle><EmptyDescription>Ask about inventory, orders, or production. Proposed movements need your confirmation before anything is recorded.</EmptyDescription></EmptyHeader></Empty>}
        {messages.map((message) => <div key={message.id} className={message.role === "user" ? "ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground" : "max-w-[90%] text-sm"}><span className="sr-only">{message.role === "user" ? "You" : "MGR"}: </span>{message.role === "assistant" ? <Streamdown disallowedElements={DISALLOWED_ELEMENTS}>{message.content}</Streamdown> : message.content}</div>)}
        {activity && <ComposerActivity>{activity}</ComposerActivity>}
        {error && <Alert><AlertDescription className="flex items-center justify-between gap-3"><span>{error}</span><Button type="button" size="sm" variant="outline" onClick={onRetry}>Try again</Button></AlertDescription></Alert>}
      </div>
    </section>
  );
}
