"use client";

import { useState, type ReactNode } from "react";
import { ComposerPanelView } from "@/components/mgr/views/composer-panel";
import { ComposerConversationView, type ComposerConversationMessage } from "@/components/mgr/views/composer-conversation";
import { ComposerStripView } from "@/components/mgr/views/composer-strip";

/** Inventory interactions stay local; no live chat or command requests. */
export function ComposerDemo({ disabled, container, initialOpen = false, children }: {
  disabled: boolean;
  container?: HTMLElement | null;
  initialOpen?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ComposerConversationMessage[]>([]);

  return <ComposerPanelView container={container} open={open} onOpenChange={setOpen}>
    {children ?? <>
      <ComposerConversationView messages={messages} onNewChat={() => { setMessages([]); setPrompt(""); }} />
      <p className="text-xs text-muted-foreground">Screen preview only. Messages stay here and are not sent to MGR.</p>
      <ComposerStripView
        disabled={disabled}
        value={prompt}
        onChange={setPrompt}
        onAction={(value) => setPrompt(value === "attention" ? "What needs my attention today?" : value === "inventory" ? "What inventory is available?" : "Help me record an inventory movement.")}
        onSubmit={(content) => { setMessages((previous) => [...previous, { id: crypto.randomUUID(), role: "user", content }]); setPrompt(""); }}
      />
    </>}
  </ComposerPanelView>;
}
