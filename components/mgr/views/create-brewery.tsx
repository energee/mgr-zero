"use client";
import { useId } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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
        <Field><FieldLabel htmlFor={`${id}-name`}>Brewery name</FieldLabel><Input id={`${id}-name`} name="name" defaultValue={state.name} required /></Field>
        <Field><FieldLabel htmlFor={`${id}-timezone`}>Timezone</FieldLabel><Input id={`${id}-timezone`} name="timezone" list={`${id}-zones`} defaultValue={state.timezone} required />
          <datalist id={`${id}-zones`}>{["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"].map(zone => <option key={zone} value={zone} />)}</datalist>
        </Field>
        <Field><FieldLabel htmlFor={`${id}-ttb`}>TTB registry number (optional)</FieldLabel><Input id={`${id}-ttb`} name="ttb" defaultValue={state.ttb} /></Field>
        {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        <Field><Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create brewery"}</Button></Field>
      </FieldGroup>
    </form>{E.sp()}
  </>;
}
