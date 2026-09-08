// app/(auth)/password/page.tsx — Set new password (staff) and Portal set
// password: the recovery-token landing (auth/confirm) and the Me sheet's
// Change password. Needs a session; membership, never the person, decides
// the shell after Save. Distinct from joining a brewery: no role, no “Join”.
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { E } from "@/components/mgr/e";
import { getRequestIdentity } from "@/lib/auth/request-context";
import { savePassword } from "../actions";
import { Entry } from "../entry";

export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, identity] = await Promise.all([searchParams, getRequestIdentity()]);
  if (!identity) redirect("/reset?expired=1");
  return (
    <Entry title="Set new password">
      {E.fld("Account", identity.email ?? "signed in")}
      {error && E.note(error)}
      <form action={savePassword}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="password">Choose a password</FieldLabel>
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Field><Button type="submit">Save password</Button></Field>
        </FieldGroup>
      </form>
    </Entry>
  );
}
