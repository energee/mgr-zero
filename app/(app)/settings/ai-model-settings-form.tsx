"use client";

import { useState } from "react";
import { AiModelSettingsView } from "@/components/mgr/views/ai-model-settings";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { GatewayModelOption } from "@/lib/chat/models";
import { toast } from "sonner";
import { aiModelSettingsReason } from "@/lib/mgr/settings-view";

export function AiModelSettingsForm({ current, models }: { current: string; models: GatewayModelOption[] }) {
  const [selection, setSelection] = useState({ initial: current, value: current });
  if (selection.initial !== current) {
    setSelection({ initial: current, value: selection.value === selection.initial ? current : selection.value });
  }
  const action = useCommandAction();
  return <AiModelSettingsView value={selection.value} initial={current} models={models}
    onChange={value => setSelection({ initial: current, value })}
    onSubmit={() => {
      if (action.busy || aiModelSettingsReason(selection.value, current, models)) return;
      void action.run("set_brewery_ai_model", { model: selection.value }, () => toast.success("AI model updated"));
    }}
    busy={action.busy} error={action.error ?? undefined} />;
}
