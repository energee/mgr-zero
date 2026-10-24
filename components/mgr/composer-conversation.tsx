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
import { COMPOSER_SETUP_ACTIVITY, loadComposerSetup } from "@/lib/composer/setup";
import { movementFormHref } from "@/lib/composer/state";

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
  // The latest setup load's controller. Starting another (Retry setup, Try
  // again) aborts it, so a replaced load stops its requests and drops its
  // response. It is never cleared: once set, setup has started in this mount.
  const latestSetup = useRef<AbortController>(undefined);
  // One create_chat_conversation identity for every setup attempt, so a retry
  // after a timeout cannot create a second conversation.
  const setupConversationRequest = useRef<string>(undefined);
  const run = (name: string, input: unknown, requestId?: string, provenance?: Parameters<typeof command>[5], signal?: AbortSignal) => command(breweryId, name, input, requestId, expectedContext, provenance, signal);
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    prepareSendMessagesRequest: ({ id, messages }) => ({ body: {
      id, breweryId, expectedContext: { actorId: expectedContext.actorId, breweryId }, message: messages.findLast((message) => message.role === "user"),
    } }),
  }), [breweryId, expectedContext.actorId]);
  const { messages, setMessages, sendMessage, regenerate, stop, status, error, clearError } = useChat({ id: conversationId, messages: initialMessages, generateId: () => crypto.randomUUID(), transport });

  // New chat: a separate private conversation, opened in the panel.
  async function newChat() {
    clearError(); setFailure(undefined); setReceipt(undefined);
    try {
      const conversation = await run("create_chat_conversation", { title: "MGR conversation" }) as { id: string };
      setInitialMessages([]); setConversationId(conversation.id); setMessages([]); onOpenChange(true);
    } catch (cause) { failed(cause, "Composer unavailable", () => void newChat()); }
  }

  // Restores (or creates) the server-owned conversation for this actor/brewery
  // scope. Named so Try again can re-run the load that failed (#329) rather
  // than only regenerating the last AI turn. loadComposerSetup's timeout ends
  // a stalled load in that same failure (#1105).
  // `signal` aborts when a newer load replaces this one.
  async function loadSetup(signal: AbortSignal) {
    try {
      const setup = await loadComposerSetup((name, input, requestId, requestSignal) => run(name, input, requestId, undefined, requestSignal), setupConversationRequest, signal);
      if (signal.aborted) return;
      setInitialMessages(setup.messages); setConversationId(setup.conversationId);
    } catch (cause) { if (!signal.aborted) failed(cause, "Composer unavailable", reloadSetup); }
  }

  // Starts a setup load and supersedes the one in flight.
  function reloadSetup() {
    latestSetup.current?.abort();
    const load = latestSetup.current = new AbortController();
    setFailure(undefined);
    void loadSetup(load.signal);
  }

  function retry() {
    if (failure) { failure.retry(); return; }
    clearError(); void regenerate();
  }

  useEffect(() => {
    if (!open || latestSetup.current) return;
    reloadSetup();
    // One restore per mount, only when the panel is needed. The app layout
    // keys Composer by actor/brewery/roles, so a new scope remounts it.
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
    <ComposerConversationView messages={transcript} onSetupRetry={!conversationId ? reloadSetup : undefined} activity={!conversationId && !failure ? COMPOSER_SETUP_ACTIVITY : status === "submitted" ? "Thinking…" : status === "streaming" ? "Responding…" : undefined} error={failure?.message ?? error?.message} onRetry={retry} onNewChat={() => void newChat()} />
    {proposalError && <p role="alert" className="rounded-md border border-destructive/40 bg-card p-3 text-sm">{proposalError}</p>}
    {proposal && !receipt && <ComposerProposalView effects={proposal.effects} warnings={proposal.warnings} openHref={movementFormHref(proposal.input, proposal.previewToken)} onOpen={() => onOpenChange(false)} onCommit={() => void commitProposal()} committing={committing} />}
    {receipt && <p role="status" className="rounded-md border bg-card p-3 text-sm font-medium">{receipt}</p>}
    {children}
    <ComposerStripView actions={[{ value: "attention", label: "What needs attention?" }, { value: "inventory", label: "Check inventory" }, { value: "movement", label: "Record a movement" }]} onAction={(value) => setPrompt(value === "attention" ? "What needs my attention today?" : value === "inventory" ? "What inventory is available?" : "Help me record an inventory movement.")} onOutbox={onOutbox} outboxCount={outboxCount} promptRef={promptRef} value={prompt} onChange={setPrompt} onSubmit={(text) => { if (!conversationId) return; setPrompt(""); setReceipt(undefined); void sendMessage({ text }); }} disabled={!conversationId || streaming || committing} streaming={streaming} onStop={stop} />
  </>;
}
