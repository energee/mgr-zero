"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCommandContext } from "@/app/(app)/brewery-provider";
import { ComposerConversationView, ComposerProposalView, ComposerStripView, OfflineOutboxView } from "@/components/mgr/views/composer";
import { Button } from "@/components/ui/button";
import { command } from "@/lib/commands/client";
import { composerMessageText, latestComposerProposal } from "@/lib/chat/messages";
import { movementFormHref } from "@/lib/composer/state";
import { discardOutbox, flushOutbox, outboxDiscardConfirmation, readOutbox, sendOutboxAttempt, visibleOutbox, type OutboxAttempt } from "@/lib/composer/outbox";
import type { StaffRole } from "@/lib/commands/registry";

type StoredMessage = { id: string; role: "user" | "assistant" | "result"; content: string | null };

export function Composer({ role }: { role: StaffRole }) {
  const expectedContext = useCommandContext();
  const breweryId = expectedContext.breweryId ?? "";
  const [conversationId, setConversationId] = useState<string>();
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [minimized, setMinimized] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [setupError, setSetupError] = useState<string>();
  const [committing, setCommitting] = useState(false);
  const [receipt, setReceipt] = useState<string>();
  const [outboxOpen, setOutboxOpen] = useState(false);
  const [outboxBusy, setOutboxBusy] = useState(false);
  const [outboxEntries, setOutboxEntries] = useState<OutboxAttempt[]>([]);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const run = (name: string, input: unknown, requestId?: string, provenance?: Parameters<typeof command>[5]) => command(breweryId, name, input, requestId, expectedContext, provenance);
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    prepareSendMessagesRequest: ({ id, messages }) => ({ body: {
      id, breweryId, expectedContext: { actorId: expectedContext.actorId, breweryId }, message: messages.findLast((message) => message.role === "user"),
    } }),
  }), [breweryId, expectedContext.actorId]);
  const { messages, setMessages, sendMessage, regenerate, stop, status, error, clearError } = useChat({ id: conversationId, messages: initialMessages, generateId: crypto.randomUUID, transport });

  async function newChat() {
    clearError(); setSetupError(undefined); setReceipt(undefined);
    try {
      const conversation = await run("create_chat_conversation", { title: "MGR conversation" }, crypto.randomUUID()) as { id: string };
      setInitialMessages([]); setConversationId(conversation.id); setMessages([]); setMinimized(false);
    } catch (cause) { setSetupError(cause instanceof Error ? cause.message : "Composer unavailable"); }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const conversations = await run("list_chat_conversations", {}) as { id: string }[];
        if (!active) return;
        if (!conversations[0]) { await newChat(); return; }
        const id = conversations[0].id;
        const history = await run("get_chat_history", { conversationId: id }) as { messages: StoredMessage[] };
        if (!active) return;
        const restored = history.messages.filter((message) => message.role !== "result" && message.content).map((message) => ({
          id: message.id, role: message.role as "user" | "assistant", parts: [{ type: "text", text: message.content! }],
        })) as UIMessage[];
        setInitialMessages(restored); setConversationId(id);
      } catch (cause) { if (active) setSetupError(cause instanceof Error ? cause.message : "Composer unavailable"); }
    })();
    return () => { active = false; };
    // One server-owned restore per actor/brewery scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breweryId, expectedContext.actorId]);

  useEffect(() => {
    const focus = (event: KeyboardEvent) => { if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); promptRef.current?.focus(); } };
    addEventListener("keydown", focus); return () => removeEventListener("keydown", focus);
  }, []);

  useEffect(() => {
    const scope = { actorId: expectedContext.actorId, breweryId, role };
    const refresh = () => setOutboxEntries(visibleOutbox(readOutbox(localStorage), scope));
    const flush = async () => { if (!navigator.onLine) return refresh(); setOutboxBusy(true); try { await flushOutbox(localStorage, scope, command); refresh(); } finally { setOutboxBusy(false); } };
    addEventListener("online", flush); addEventListener("mgr-outbox-change", refresh); refresh(); if (navigator.onLine) void flush();
    return () => { removeEventListener("online", flush); removeEventListener("mgr-outbox-change", refresh); };
  }, [breweryId, expectedContext.actorId, role]);

  const proposal = latestComposerProposal(messages);
  const transcript = messages.map((message) => ({ id: message.id, role: message.role === "user" ? "user" as const : "assistant" as const, content: composerMessageText(message) })).filter((message) => message.content);
  const streaming = status === "submitted" || status === "streaming";

  async function commitProposal() {
    if (!proposal || committing || !conversationId) return;
    setCommitting(true); setSetupError(undefined);
    try {
      const result = await run(proposal.name, proposal.input, crypto.randomUUID(), { origin: "chat", conversationId, previewToken: proposal.previewToken }) as { id?: string };
      setReceipt(result.id ? `Recorded · ${result.id}` : "Recorded");
    } catch (cause) { setSetupError(cause instanceof Error ? cause.message : "Could not record proposal"); }
    finally { setCommitting(false); }
  }

  async function retryOutbox(id?: string) {
    const scope = { actorId: expectedContext.actorId, breweryId, role }; setOutboxBusy(true);
    try { if (id) await sendOutboxAttempt(localStorage, id, scope, command); else await flushOutbox(localStorage, scope, command); setOutboxEntries(visibleOutbox(readOutbox(localStorage), scope)); }
    finally { setOutboxBusy(false); }
  }

  function discardEntries(ids: string[]) {
    const scope = { actorId: expectedContext.actorId, breweryId, role };
    const confirmation = outboxDiscardConfirmation(outboxEntries.filter((entry) => ids.includes(entry.id)));
    if (!confirm(confirmation)) return;
    discardOutbox(localStorage, scope, ids, confirmation); setOutboxEntries(visibleOutbox(readOutbox(localStorage), scope));
  }

  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
    {minimized ? <Button type="button" variant="outline" className="self-end" onClick={() => setMinimized(false)}>Open conversation</Button> : <ComposerConversationView messages={transcript} activity={status === "submitted" ? "Thinking…" : status === "streaming" ? "Responding…" : undefined} error={setupError ?? error?.message} onRetry={() => { clearError(); void regenerate(); }} onNewChat={() => void newChat()} onMinimize={() => setMinimized(true)} />}
    {proposal && !receipt && <ComposerProposalView effects={proposal.effects} warnings={proposal.warnings} openHref={movementFormHref(proposal.input)} onCommit={() => void commitProposal()} committing={committing} />}
    {receipt && <p role="status" className="rounded-md border bg-card p-3 text-sm font-medium">{receipt}</p>}
    {outboxOpen && <><OfflineOutboxView rows={outboxEntries.map((entry) => ({ id: entry.id, label: entry.label, status: entry.lastError ?? entry.state, retryable: entry.state === "queued" || entry.state === "uncertain" }))} busy={outboxBusy} onRetry={(id) => void retryOutbox(id)} onRetryAll={() => void retryOutbox()} onDiscard={(id) => discardEntries([id])} onDiscardAll={() => discardEntries(outboxEntries.map((entry) => entry.id))} /><Button type="button" variant="ghost" className="self-start" onClick={() => setOutboxOpen(false)}>Close outbox</Button></>}
    <ComposerStripView actions={[{ value: "attention", label: "What needs attention?" }, { value: "inventory", label: "Check inventory" }, { value: "movement", label: "Record a movement" }]} onAction={(value) => setPrompt(value === "attention" ? "What needs my attention today?" : value === "inventory" ? "What inventory is available?" : "Help me record an inventory movement.")} onOutbox={() => setOutboxOpen(true)} outboxCount={outboxEntries.length} promptRef={promptRef} value={prompt} onChange={setPrompt} onSubmit={(text) => { if (!conversationId) return; setPrompt(""); setReceipt(undefined); void sendMessage({ text }); }} disabled={!conversationId || streaming || committing} streaming={streaming} onStop={stop} />
  </div>;
}
