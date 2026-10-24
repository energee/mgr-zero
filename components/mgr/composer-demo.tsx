"use client";

import { useState } from "react";
import { ComposerDrawerView } from "@/components/mgr/views/composer-drawer";
import { ComposerConversationView, type ComposerConversationMessage } from "@/components/mgr/views/composer-conversation";
import { ComposerStripView } from "@/components/mgr/views/composer-strip";

/** Inventory interactions stay local; no live chat or command requests. */
export function ComposerDemo({ disabled, container }: { disabled: boolean; container?: HTMLElement | null }) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ComposerConversationMessage[]>([]);
  const [outboxOpen, setOutboxOpen] = useState(false);

  return <ComposerDrawerView container={container}>
    <ComposerConversationView messages={messages} onNewChat={() => { setMessages([]); setPrompt(""); }} />
    <p className="text-xs text-muted-foreground">Screen preview only. Messages stay here and are not sent to MGR.</p>
    {outboxOpen && <p role="status">No offline readings in this preview.</p>}
    <ComposerStripView
      disabled={disabled}
      value={prompt}
      onChange={setPrompt}
      onAction={(value) => setPrompt(value === "attention" ? "What needs my attention today?" : value === "inventory" ? "What inventory is available?" : "Help me record an inventory movement.")}
      onOutbox={() => setOutboxOpen((previous) => !previous)}
      onSubmit={(content) => { setMessages((previous) => [...previous, { id: crypto.randomUUID(), role: "user", content }]); setPrompt(""); }}
    />
  </ComposerDrawerView>;
}
