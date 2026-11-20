// app/(app)/settings/release-settings-form.tsx — the live Releases section of
// Settings: ReleaseSettingsFormView saved with set_release_defaults.
"use client";

import { toast } from "sonner";
import { ReleaseSettingsFormView } from "@/components/mgr/views/release-settings-form";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { releaseDefaultsCommand, toReleaseSettingsValues, type ReleaseSettings, type ReleaseShareRow } from "@/lib/mgr/release-settings-view";

export function ReleaseSettingsForm({ brewery, shares }: { brewery: ReleaseSettings; shares: ReleaseShareRow[] }) {
  const action = useCommandAction();
  const initial = toReleaseSettingsValues(brewery);
  return <ReleaseSettingsFormView initial={initial} shares={shares} busy={action.busy} error={action.error}
    onSave={(values) => {
      const command = releaseDefaultsCommand(values, initial);
      if (action.busy || command.reason) return;
      void action.run(command.name, command.input, () => toast.success("Release settings saved"));
    }} />;
}
