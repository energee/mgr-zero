// components/mgr/views/agents-settings.tsx — the Admin switch for outside agents
// in Settings. Flipping it is the save: the live adapter sends it from onChange.
import { E } from "@/components/mgr/e";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { navAbout } from "@/lib/mgr/nav";

export function AgentsSettingsView({ enabled, onChange, busy = false, error, activityHref }: {
  enabled: boolean;
  onChange?: (enabled: boolean) => void;
  busy?: boolean;
  error?: string;
  activityHref?: string;
}) {
  return <FieldSet className="min-w-0">
    <FieldLegend><h2 className="font-heading text-xl font-semibold">Agents</h2></FieldLegend>
    {E.row("Allow outside agents",
      "Staff can connect Claude, ChatGPT and similar. Off stops them all at once.",
      E.sw(enabled, "Allow outside agents", onChange, !onChange || busy))}
    {E.nav("Agent activity", navAbout("Agent activity"), "", undefined, activityHref)}
    <CommandFormMessage error={error} />
  </FieldSet>;
}
