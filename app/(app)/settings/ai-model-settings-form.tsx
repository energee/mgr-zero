"use client";

import { useState } from "react";
import { AiModelSettingsView } from "@/components/mgr/views/ai-model-settings";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { GatewayModelOption } from "@/lib/chat/models";

export function AiModelSettingsForm({ current, models }: { current: string; models: GatewayModelOption[] }) {
  const [model, setModel] = useState(current);
  const action = useCommandAction();
  return <AiModelSettingsView value={model} models={models} onChange={setModel} onSubmit={() => void action.run("set_brewery_ai_model", { model })} busy={action.busy} error={action.error ?? undefined} />;
}
