"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function CreateBreweryForm({ action, requestId }: {
  action: (previous: string | null, form: FormData) => Promise<string | null>;
  requestId: string;
}) {
  const [error, submit, pending] = useActionState(action, null);
  return <form action={submit}>
    <input type="hidden" name="requestId" value={requestId} />
    <FieldGroup>
      <Field><FieldLabel htmlFor="name">Brewery name</FieldLabel><Input id="name" name="name" required /></Field>
      <Field><FieldLabel htmlFor="timezone">Timezone</FieldLabel><Input id="timezone" name="timezone" defaultValue="America/New_York" required /></Field>
      <Field><FieldLabel htmlFor="ttb">TTB registry number (optional)</FieldLabel><Input id="ttb" name="ttb" /></Field>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Field><Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create brewery"}</Button></Field>
    </FieldGroup>
  </form>;
}
