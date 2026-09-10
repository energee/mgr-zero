/**
 * Login form card for the staff/customer sign-in page.
 *
 * Adapted from the shadcn `login-03` block. The block's social-login buttons
 * and sign-up link were removed: MGR accounts are created by invitation (see
 * `invite_staff` / `invite_customer_user` commands) and no OAuth provider is
 * configured. Forgot password opens /reset. Submission goes to the `login`
 * server action, which redirects back with `?error=1` on failure. `portal`
 * draws the buyer's variant (screen record Portal sign in).
 */
import { cn } from "@/lib/utils"
import { emailLogin, login } from "@/app/(auth)/actions"
import { MgrIcon } from "@/components/mgr-icon"
import { E } from "@/components/mgr/e"
import { EntrySurface } from "@/components/mgr/entry-surface"
import { EntryView } from "@/components/mgr/views/entry"
import { portalSignIn, signIn } from "@/lib/mgr/fixtures/entry"

export function LoginForm({
  className,
  error,
  sent,
  portal,
  ...props
}: React.ComponentProps<"div"> & { error?: string; sent?: boolean; portal?: boolean }) {
  const fixture = portal ? portalSignIn : signIn;
  const model = {
    ...fixture,
    note: error,
    info: sent ? "Check your email for a sign-in link." : undefined,
  };
  return (
    <div className={cn("contents", className)} {...props}>
      <EntrySurface>
        {E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>)}
        <EntryView
          model={model}
          action={login}
          secondaryAction={portal ? undefined : emailLogin}
          hidden={portal ? <input type="hidden" name="portal" value="1" /> : null}
          linkHref={portal ? "/reset?portal=1" : "/reset"}
        />
      </EntrySurface>
    </div>
  )
}
