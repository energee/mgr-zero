// app/(app)/settings/suggestion-settings-form.tsx — saves the brewery's TypeSafe key and
// the "Suggest kinds for new materials" switch from Settings. The key is a one-time
// secret: `durable: false` keeps it out of the saved-request store in sessionStorage.
"use client";

import { SuggestionSettingsView } from "@/components/mgr/views/suggestion-settings";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { TypeSafeKeyStatus } from "@/lib/mgr/settings-view";

export function SuggestionSettingsForm({ status }: { status: TypeSafeKeyStatus }) {
  const action = useCommandAction();
  const setKey = (apiKey: string | null) => action.run("set_brewery_typesafe_key", { apiKey }, undefined, { durable: false });
  return <SuggestionSettingsView status={status} busy={action.busy} error={action.error ?? undefined}
    onSaveKey={setKey} onRemoveKey={() => setKey(null)}
    onEnabledChange={enabled => action.run("set_brewery_suggestions_enabled", { enabled })} />;
}
