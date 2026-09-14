"use client";
import { useId } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";

export type CreateBreweryState = { error: string | null; name: string; timezone: string; ttb: string };
export const emptyBrewery: CreateBreweryState = { error: null, name: "", timezone: "America/New_York", ttb: "" };

export function CreateBreweryView({ state = emptyBrewery, action, pending = false, requestId, actorId }: {
  state?: CreateBreweryState; action?: (form: FormData) => void; pending?: boolean; requestId?: string; actorId?: string;
}) {
  const id = useId();
  return <>
    {E.sp()}{E.ttl("Create brewery")}{E.note("You will be the brewery’s first admin.")}
    <form action={action} onSubmit={action ? undefined : event => event.preventDefault()}>
      {requestId && <input type="hidden" name="requestId" value={requestId} />}
      {actorId && <input type="hidden" name="actorId" value={actorId} />}
      <FieldGroup>
        {E.edit("Brewery name", state.name, "text", undefined, { id: `${id}-name`, name: "name", required: true })}
        {E.edit("Timezone", state.timezone, "text", ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"], { id: `${id}-timezone`, name: "timezone", required: true })}
        {E.edit("TTB registry number (optional)", state.ttb, "text", undefined, { id: `${id}-ttb`, name: "ttb" })}
        {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        <Field><Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create brewery"}</Button></Field>
      </FieldGroup>
    </form>{E.sp()}
  </>;
}
