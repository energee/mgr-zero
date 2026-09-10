// app/(auth)/reset/page.tsx — Reset password (staff) and Portal forgot
// password (?portal=1): one email field → sendReset. The sent state is this
// same screen with the info line, so enumeration is never confirmed; ?expired
// is the Expired reset landing from auth/confirm.
import { E } from "@/components/mgr/e";
import { EntrySurface } from "@/components/mgr/entry-surface";
import { EntryView } from "@/components/mgr/views/entry";
import { expiredReset, portalForgotPassword, resetPassword } from "@/lib/mgr/fixtures/entry";
import { MgrIcon } from "@/components/mgr-icon";
import { sendReset } from "../actions";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ sent?: string; expired?: string; portal?: string }> }) {
  const { sent, expired, portal } = await searchParams;
  const fixture = expired ? expiredReset : portal ? portalForgotPassword : resetPassword;
  const model = { ...fixture, info: sent ? portalForgotPassword.info : fixture.info };
  return (
    <EntrySurface>
      {E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>)}
      <EntryView
        model={model}
        action={expired ? undefined : sendReset}
        primaryHref={expired ? `/reset${portal ? "?portal=1" : ""}` : undefined}
        hidden={portal ? <input type="hidden" name="portal" value="1" /> : null}
      />
    </EntrySurface>
  );
}
