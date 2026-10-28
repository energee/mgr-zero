"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { RemoveVesselControl, VesselDetailView } from "@/components/mgr/views/vessel-detail";
import { vesselReason, type VesselDetailViewModel } from "@/lib/mgr/vessel-detail-view";
import { useCommandAction } from "@/lib/commands/use-command-form";

/** Admin edit of one vessel; `vesselId` is absent for a new vessel, which has nothing to delete.
 *  `actions` are the open occupancy's cellar verbs, passed through to the view. */
export function VesselForm({ vesselId, model, actions }: { vesselId?: string; model: VesselDetailViewModel; actions?: ReactNode }) {
  const router = useRouter();
  const [name, setName] = useState(model.name);
  const [kind, setKind] = useState(model.type);
  const [capacity, setCapacity] = useState(model.capacity);
  const action = useCommandAction();
  const reason = vesselReason({ name, capacity });
  return <form className="flex flex-col gap-3" onSubmit={event => {
    event.preventDefault();
    if (action.busy || reason) return;
    void action.run("upsert_vessel", { id: vesselId, name, kind: kind.toLowerCase(), capacityBbl: Number(capacity) }, () => router.push("/cellar"));
  }}>
    <VesselDetailView model={{ ...model, name, type: kind, capacity }} onName={setName} onType={setKind} onCapacity={setCapacity}
      reason={reason} submitting={action.busy} messages={<CommandFormMessage error={action.error} />} actions={actions}
      remove={vesselId && !model.retired && <RemoveVesselControl vessel={model.title} busy={action.busy} error={action.error}
        onDelete={() => action.run("delete_vessel", { vesselId }, () => router.push("/cellar"))} />} />
  </form>;
}
