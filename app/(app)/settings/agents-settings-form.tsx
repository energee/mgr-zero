// app/(app)/settings/agents-settings-form.tsx — saves the Admin switch for outside
// agents on tap, and shows the saved value again if the save fails.
"use client";

import { useState } from "react";
import { AgentsSettingsView } from "@/components/mgr/views/agents-settings";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function AgentsSettingsForm({ current }: { current: boolean }) {
  const [value, setValue] = useState(current);
  // A refresh with a new saved value is the truth (React's "derive state from props" pattern).
  const [seen, setSeen] = useState(current);
  if (seen !== current) { setSeen(current); setValue(current); }
  const action = useCommandAction();
  return <AgentsSettingsView enabled={value} busy={action.busy} error={action.error ?? undefined} activityHref="/settings/agents/activity"
    onChange={enabled => {
      setValue(enabled);
      void action.run("set_brewery_agents_enabled", { enabled }).then(ok => { if (!ok) setValue(current); });
    }} />;
}
