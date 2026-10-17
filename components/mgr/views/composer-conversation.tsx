import { Streamdown } from "streamdown";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const DISALLOWED_ELEMENTS = ["img"];

export type ComposerConversationMessage = { id: string; role: "user" | "assistant"; content: string };

export function ComposerConversationView({ messages, model, activity, error, onRetry, onNewChat, onSetupRetry }: {
  messages: ComposerConversationMessage[];
  model?: string;
  activity?: string;
  error?: string;
  onRetry?: () => void;
  onNewChat?: () => void;
  onSetupRetry?: () => void;
}) {
  return (
    <section aria-label="MGR conversation" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-col gap-2 px-1 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-semibold">Ask MGR</h2><p className="text-xs text-muted-foreground">Answers use your brewery data and permissions.{model ? ` · ${model}` : ""}</p></div>
        <Button type="button" size="sm" variant="ghost" onClick={onSetupRetry ?? onNewChat}>{onSetupRetry ? "Retry setup" : "New chat"}</Button>
      </header>
      <div role="log" aria-live="polite" className="min-h-40 flex-1 space-y-4 overflow-y-auto px-1 py-3">
        {messages.map((message) => <div key={message.id} className={message.role === "user" ? "ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground" : "max-w-[90%] text-sm"}><span className="sr-only">{message.role === "user" ? "You" : "MGR"}: </span>{message.role === "assistant" ? <Streamdown disallowedElements={DISALLOWED_ELEMENTS}>{message.content}</Streamdown> : message.content}</div>)}
        {activity && <p className="text-sm text-muted-foreground">{activity}</p>}
        {error && <Alert><AlertDescription className="flex items-center justify-between gap-3"><span>{error}</span><Button type="button" size="sm" variant="outline" onClick={onRetry}>Try again</Button></AlertDescription></Alert>}
      </div>
    </section>
  );
}
