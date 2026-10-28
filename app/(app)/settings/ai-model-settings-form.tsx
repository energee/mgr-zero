"use client";

import { useState } from "react";
import { AiModelSettingsView } from "@/components/mgr/views/ai-model-settings";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { GatewayModelOption } from "@/lib/chat/models";
import { toast } from "sonner";

/** Saves a picked model at once and shows the saved one again if the save fails (#1509). */
export function AiModelSettingsForm({ current, models }: { current: string; models: GatewayModelOption[] }) {
  const [value, setValue] = useState(current);
  // A refresh with a new saved model is the truth (React's "derive state from props" pattern).
  const [seen, setSeen] = useState(current);
  if (seen !== current) { setSeen(current); setValue(current); }
  const action = useCommandAction();
  return <AiModelSettingsView value={value} models={models}
    onChange={model => {
      if (action.busy || model === current) return;
      setValue(model);
      void action.run("set_brewery_ai_model", { model }, () => toast.success("AI model updated")).then(ok => { if (!ok) setValue(current); });
    }}
    busy={action.busy} error={action.error ?? undefined} />;
}
