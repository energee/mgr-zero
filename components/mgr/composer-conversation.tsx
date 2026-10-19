"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCommandContext } from "@/lib/brewery-provider";
import { ComposerConversationView } from "@/components/mgr/views/composer-conversation";
import { ComposerProposalView } from "@/components/mgr/views/composer";
import { ComposerStripView } from "@/components/mgr/views/composer-strip";
import { command } from "@/lib/commands/client";
import { composerMessageText, latestComposerProposal } from "@/lib/chat/messages";
import { movementFormHref } from "@/lib/composer/state";

type StoredMessage = { id: string; role: "user" | "assistant" | "result"; content: string | null };

export default function ComposerConversation({ open, onOpenChange, focusRequest, outboxCount, onOutbox, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focusRequest: number;
  outboxCount: number;
  onOutbox: () => void;
  children: ReactNode;
}) {
  const expectedContext = useCommandContext();
  const breweryId = expectedContext.breweryId ?? "";
  const [conversationId, setConversationId] = useState<string>();
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  // A failure carries the recovery that fits it, so Try again re-runs what
  // actually failed — the setup load, the new chat, or the proposal commit —
  // instead of one handler guessing from a bare message string (#329).
  const [failure, setFailure] = useState<{ message: string; retry: () => void }>();
  const failed = (cause: unknown, fallback: string, retry: () => void) =>
    setFailure({ message: cause instanceof Error ? cause.message : fallback, retry });
  const [committing, setCommitting] = useState(false);
  const [receipt, setReceipt] = useState<string>();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const focusedRequest = useRef(0);
  // Identifies the current setup load; a superseded run drops its response.
  const setupRun = useRef(0);
  const setupConversationRequest = useRef<string>(undefined);
  const run = (name: string, input: unknown, requestId?: string, provenance?: Parameters<typeof command>[5]) => command(breweryId, name, input, requestId, expectedContext, provenance);
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    prepareSendMessagesRequest: ({ id, messages }) => ({ body: {
      id, breweryId, expectedContext: { actorId: expectedContext.actorId, breweryId }, message: messages.findLast((message) => message.role === "user"),
    } }),
  }), [breweryId, expectedContext.actorId]);
  const { messages, setMessages, sendMessage, regenerate, stop, status, error, clearError } = useChat({ id: conversationId, messages: initialMessages, generateId: () => crypto.randomUUID(), transport });

  async function newChat(openDrawer = true, live = () => true) {
    clearError(); setFailure(undefined); setReceipt(undefined);
    try {
      const requestId = openDrawer ? crypto.randomUUID() : (setupConversationRequest.current ??= crypto.randomUUID());
      const conversation = await run("create_chat_conversation", { title: "MGR conversation" }, requestId) as { id: string };
      if (!live()) return;
      setInitialMessages([]); setConversationId(conversation.id); setMessages([]); if (openDrawer) onOpenChange(true);
    } catch (cause) { if (live()) failed(cause, "Composer unavailable", openDrawer ? () => void newChat() : reloadSetup); }
  }

  // Restores the server-owned conversation for this actor/brewery scope. Named
  // so Try again can re-run the load that failed (#329) rather than only
  // regenerating the last AI turn; `live` drops a response the scope outlived.
  async function loadSetup(live: () => boolean) {
    try {
      const conversations = await run("list_chat_conversations", {}) as { id: string }[];
      if (!live()) return;
      if (!conversations[0]) { await newChat(false, live); return; }
      const id = conversations[0].id;
      const history = await run("get_chat_history", { conversationId: id }) as { messages: StoredMessage[] };
      if (!live()) return;
      const restored = history.messages.filter((message) => message.role !== "result" && message.content).map((message) => ({
        id: message.id, role: message.role as "user" | "assistant", parts: [{ type: "text", text: message.content! }],
      })) as UIMessage[];
      setInitialMessages(restored); setConversationId(id);
    } catch (cause) { if (live()) failed(cause, "Composer unavailable", reloadSetup); }
  }

  // A retry outlives the scope it started in, so the reload holds the scope it
  // was issued for and a later one supersedes it.
  function reloadSetup() {
    const issued = ++setupRun.current;
    setFailure(undefined);
    void loadSetup(() => issued === setupRun.current);
  }

  function retry() {
    if (failure) { failure.retry(); return; }
    clearError(); void regenerate();
  }

  useEffect(() => {
    if (!open || setupRun.current > 0) return;
    const issued = ++setupRun.current;
    void loadSetup(() => issued === setupRun.current);
    // One restore per actor/brewery scope, only when the drawer is needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, breweryId, expectedContext.actorId]);

  useEffect(() => {
    // The shortcut may precede both the lazy chunk and the enabled input.
    if (!open || !conversationId || focusRequest === focusedRequest.current) return;
    const frame = requestAnimationFrame(() => {
      promptRef.current?.focus();
      focusedRequest.current = focusRequest;
    });
    return () => cancelAnimationFrame(frame);
  }, [open, conversationId, focusRequest]);

  // A rejected proposal comes back as proposalError with nothing to commit. It
  // gets its own alert, not the conversation's Try again, which regenerates
  // the last AI turn rather than retrying the proposal.
  const { proposal, error: proposalError } = latestComposerProposal(messages);
  const transcript = messages.map((message) => ({ id: message.id, role: message.role === "user" ? "user" as const : "assistant" as const, content: composerMessageText(message) })).filter((message) => message.content);
  const streaming = status === "submitted" || status === "streaming";

  async function commitProposal() {
    if (!proposal || committing || !conversationId) return;
    setCommitting(true); setFailure(undefined);
    try {
      const result = await run(proposal.name, proposal.input, crypto.randomUUID(), { origin: "chat", conversationId, previewToken: proposal.previewToken }) as { id?: string };
      setReceipt(result.id ? `Recorded · ${result.id}` : "Recorded");
    } catch (cause) { failed(cause, "Could not record proposal", () => void commitProposal()); }
    finally { setCommitting(false); }
  }

  return <>
    <ComposerConversationView messages={transcript} onSetupRetry={!conversationId ? reloadSetup : undefined} activity={!conversationId && !failure ? "Opening your conversation… Input becomes available when setup finishes. If this persists, retry setup or ask your administrator to check the connection." : status === "submitted" ? "Thinking…" : status === "streaming" ? "Responding…" : undefined} error={failure?.message ?? error?.message} onRetry={retry} onNewChat={() => void newChat()} />
    {proposalError && <p role="alert" className="rounded-md border border-destructive/40 bg-card p-3 text-sm">{proposalError}</p>}
    {proposal && !receipt && <ComposerProposalView effects={proposal.effects} warnings={proposal.warnings} openHref={movementFormHref(proposal.input)} onCommit={() => void commitProposal()} committing={committing} />}
    {receipt && <p role="status" className="rounded-md border bg-card p-3 text-sm font-medium">{receipt}</p>}
    {children}
    <ComposerStripView actions={[{ value: "attention", label: "What needs attention?" }, { value: "inventory", label: "Check inventory" }, { value: "movement", label: "Record a movement" }]} onAction={(value) => setPrompt(value === "attention" ? "What needs my attention today?" : value === "inventory" ? "What inventory is available?" : "Help me record an inventory movement.")} onOutbox={onOutbox} outboxCount={outboxCount} promptRef={promptRef} value={prompt} onChange={setPrompt} onSubmit={(text) => { if (!conversationId) return; setPrompt(""); setReceipt(undefined); void sendMessage({ text }); }} disabled={!conversationId || streaming || committing} streaming={streaming} onStop={stop} />
  </>;
}
