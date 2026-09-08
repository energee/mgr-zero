import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { E } from "@/components/mgr/e";
import { createRequestAuthContext } from "@/lib/auth/request-context";
import { inviteAudience, inviteLanding } from "@/lib/auth/invite";
import { createServerClient } from "@/lib/supabase/server";
import { acceptInvite } from "../actions";
import { Entry } from "../entry";

export default async function AcceptPage({ searchParams }: { searchParams: Promise<{ audience?: string; error?: string; name?: string }> }) {
  const { audience: rawAudience, error, name } = await searchParams;
  const audience = inviteAudience(rawAudience);
  if (!audience) redirect("/invite-expired");
  const db = await createServerClient();
  const { data } = await db.auth.getUser();
  const landing = await inviteLanding(createRequestAuthContext(() => Promise.resolve(db)), audience);
  if (!landing || data.user?.user_metadata?.mgr_invite_kind !== audience || data.user.user_metadata.mgr_invite_accepted) redirect("/invite-expired");

  return <Entry title={`Join ${landing.name}`}>
    {E.fld("Role", landing.role)}
    {error && E.note("Enter your name and a password of at least 8 characters.")}
    <form action={acceptInvite}>
      <input type="hidden" name="audience" value={audience} />
      <FieldGroup>
        <Field><FieldLabel htmlFor="name">Your name</FieldLabel><Input id="name" name="name" autoComplete="name" defaultValue={name} required /></Field>
        <Field><FieldLabel htmlFor="password">Choose a password</FieldLabel><Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required /></Field>
        <Field><Button type="submit">Join {landing.name}</Button></Field>
      </FieldGroup>
    </form>
  </Entry>;
}
