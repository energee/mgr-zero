// app/(auth)/reset/page.tsx — Reset password (staff) and Portal forgot
// password (?portal=1): one email field → sendReset. The sent state is this
// same screen with the info line, so enumeration is never confirmed; ?expired
// is the Expired reset landing from auth/confirm.
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { E } from "@/components/mgr/e";
import { sendReset } from "../actions";
import { Entry } from "../entry";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ sent?: string; expired?: string; portal?: string }> }) {
  const { sent, expired, portal } = await searchParams;
  return (
    <Entry title="Reset password">
      {expired && E.note("This reset link is no longer valid. Request a new one.")}
      <form action={sendReset}>
        <FieldGroup>
          {portal && <input type="hidden" name="portal" value="1" />}
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field><Button type="submit">Send reset link</Button></Field>
        </FieldGroup>
      </form>
      {sent && E.info("If that email is on an account, a reset link is on its way.")}
    </Entry>
  );
}
