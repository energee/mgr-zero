"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SkuView } from "@/components/mgr/views/sku";
import { pourSkuName, toSkuViewProps } from "@/lib/mgr/sku-view";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandForm } from "@/lib/commands/use-command-form";

export function PourForm({ priceGroupId, groupName, pour }: {
  priceGroupId: string; groupName?: string; pour?: { id: string; name: string; ounces: number };
}) {
  const [name, setName] = useState(pour?.name ?? "");
  const [ounces, setOunces] = useState(pour ? String(pour.ounces) : "");
  const form = useCommandForm("upsert_format", {
    build: () => ({ id: pour?.id, name: pourSkuName(name, ounces), basis: "poured", priceGroupId, ounces: Number(ounces) }),
    reset: () => { setName(pour?.name ?? ""); setOunces(pour ? String(pour.ounces) : ""); },
  });
  return <CommandForm open={form.open} onOpenChange={form.setOpen} title={pour ? `Edit pour${groupName ? ` · ${groupName}` : ""}` : `Add pour${groupName ? ` · ${groupName}` : ""}`} trigger={<Button variant="outline" size="sm">{pour ? "Edit pour" : "Add pour"}</Button>}>
    <form onSubmit={form.submit} className="flex flex-col gap-4">
      <SkuView
        model={{ ...toSkuViewProps({ formats: [] }), kind: "poured", pourName: name, ounces }}
        locked
        controls={{ pourName: setName, ounces: setOunces }}
        messages={<CommandFormMessage error={form.error} />}
        footer={<CommandFormFooter><Button type="submit" disabled={form.submitting || !(Number(ounces) > 0 && Number(ounces) < 1000)}>{form.submitting ? "Saving…" : "Save pour"}</Button></CommandFormFooter>}
      />
    </form>
  </CommandForm>;
}
