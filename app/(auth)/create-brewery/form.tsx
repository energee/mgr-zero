"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export type CreateBreweryState = {
  error: string | null;
  name: string;
  timezone: string;
  ttb: string;
};

export function CreateBreweryForm({ action, requestId, actorId }: {
  action: (previous: CreateBreweryState, form: FormData) => Promise<CreateBreweryState>;
  requestId: string;
  actorId: string;
}) {
  const [state, submit, pending] = useActionState(action, { error: null, name: "", timezone: "America/New_York", ttb: "" });
  return <form action={submit}>
    <input type="hidden" name="requestId" value={requestId} />
    <input type="hidden" name="actorId" value={actorId} />
    <FieldGroup>
      <Field><FieldLabel htmlFor="name">Brewery name</FieldLabel><Input id="name" name="name" defaultValue={state.name} required /></Field>
      <Field><FieldLabel htmlFor="timezone">Timezone</FieldLabel><Input id="timezone" name="timezone" defaultValue={state.timezone} required /></Field>
      <Field><FieldLabel htmlFor="ttb">TTB registry number (optional)</FieldLabel><Input id="ttb" name="ttb" defaultValue={state.ttb} /></Field>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <Field><Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create brewery"}</Button></Field>
    </FieldGroup>
  </form>;
}
