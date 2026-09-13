"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { VesselDetailView } from "@/components/mgr/views/vessel-detail";
import type { VesselDetailViewModel } from "@/lib/mgr/vessel-detail-view";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function VesselForm({ vesselId, model }: { vesselId?: string; model: VesselDetailViewModel }) {
  const router = useRouter();
  const [name, setName] = useState(model.name);
  const [kind, setKind] = useState(model.type);
  const [capacity, setCapacity] = useState(model.capacity);
  const action = useCommandAction();
  const disabled = !name.trim() || !Number.isFinite(Number(capacity)) || Number(capacity) <= 0;
  return <form className="flex flex-col gap-3" onSubmit={event => {
    event.preventDefault();
    if (action.busy || disabled) return;
    void action.run("upsert_vessel", { id: vesselId, name, kind: kind.toLowerCase(), capacityBbl: Number(capacity) }, () => router.push("/cellar"));
  }}>
    <VesselDetailView model={{ ...model, name, type: kind, capacity }} onName={setName} onType={setKind} onCapacity={setCapacity}
      disabled={disabled} submitting={action.busy} messages={<CommandFormMessage error={action.error} />} />
  </form>;
}
