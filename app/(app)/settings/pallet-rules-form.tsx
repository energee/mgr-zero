// app/(app)/settings/pallet-rules-form.tsx — the live Pallets section of
// Settings: PalletRulesFormView saved with set_pallet_rules.
"use client";

import { toast } from "sonner";
import { PalletRulesFormView } from "@/components/mgr/views/pallet-rules-form";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { PalletRules } from "@/lib/mgr/pallet-fit";
import { palletRulesCommand, toPalletRulesValues } from "@/lib/mgr/pallet-rules-view";

export function PalletRulesForm({ rules, sizes }: { rules: PalletRules; sizes: string[] }) {
  const action = useCommandAction();
  const initial = toPalletRulesValues(rules);
  return <PalletRulesFormView initial={initial} sizes={sizes} busy={action.busy} error={action.error}
    onSave={(values) => {
      const command = palletRulesCommand(values, initial);
      if (action.busy || command.reason) return;
      void action.run(command.name, command.input, () => toast.success("Pallet rules saved"));
    }} />;
}
