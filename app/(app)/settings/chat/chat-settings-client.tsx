// app/(app)/settings/chat/chat-settings-client.tsx — fixture-only preview
// panel for Settings › Chat. Holds the picker selection; the health/settings
// controls arrive with the settings page task (plan Task 12).
"use client";

import { useState } from "react";
import type { ChatPreviewId } from "@/lib/chat/contracts";
import { CHAT_PREVIEW_FIXTURES } from "@/lib/chat/preview-fixtures";
import { ChatPreview, ChatPreviewPicker } from "@/lib/chat/preview-web";

export function ChatPreviewPanel({ initial = "app-home" }: { initial?: ChatPreviewId }) {
  const [selected, setSelected] = useState<ChatPreviewId>(initial);
  const fixture = CHAT_PREVIEW_FIXTURES.find(({ id }) => id === selected) ?? CHAT_PREVIEW_FIXTURES[0];
  return (
    <div className="flex flex-col gap-4">
      <ChatPreviewPicker selected={selected} onSelect={setSelected} />
      <ChatPreview fixture={fixture} />
    </div>
  );
}
