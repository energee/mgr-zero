"use client";
import { useActionState } from "react";
import { CreateBreweryView, emptyBrewery, type CreateBreweryState } from "@/components/mgr/views/create-brewery";
export type { CreateBreweryState };

export function CreateBreweryForm({ action, requestId, actorId }: {
  action: (previous: CreateBreweryState, form: FormData) => Promise<CreateBreweryState>;
  requestId: string;
  actorId: string;
}) {
  const [state, submit, pending] = useActionState(action, emptyBrewery);
  return <CreateBreweryView state={state} action={submit} pending={pending} requestId={requestId} actorId={actorId} />;
}
