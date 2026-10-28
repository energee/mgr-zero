/**
 * Login form card for the staff/customer sign-in page.
 *
 * Adapted from the shadcn `login-03` block. The block's social-login buttons
 * and sign-up link were removed: MGR accounts are created by invitation (see
 * `invite_staff` / `invite_customer_user` commands) and no OAuth provider is
 * configured. Forgot password opens /reset; the staff and portal variants
 * link each other (/login, /portal/login). The login server action returns
 * failed credentials as form state, never a query string. `portal` draws the
 * buyer's variant (screen record Portal sign in). Staff email-link entry
 * validates email only; password sign-in still requires both fields.
 */
"use client";

import { useActionState } from "react"
import { cn } from "@/lib/utils"
import { emailLogin, login } from "@/app/(auth)/actions"
import { MgrIcon } from "@/components/mgr-icon"
import { E } from "@/components/mgr/e"
import { EntrySurface } from "@/components/mgr/entry-surface"
import { EntryView } from "@/components/mgr/views/entry"
import { portalSignInModel, signInModel } from "@/lib/mgr/entry-view"

export function LoginForm({
  className,
  error,
  sent,
  portal,
  email,
  next,
  ...props
}: React.ComponentProps<"div"> & { error?: string; sent?: boolean; portal?: boolean; email?: string; next?: string }) {
  const [state, submit] = useActionState(login, { email, error });
  const baseModel = portal ? portalSignInModel : signInModel;
  const model = {
    ...baseModel,
    error: state.error,
    info: sent ? "Check your email for a sign-in link." : undefined,
  };
  return (
    <div className={cn("contents", className)} {...props}>
      <EntrySurface>
        {E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>)}
        <EntryView
          model={model}
          action={submit}
          secondaryAction={portal ? undefined : emailLogin}
          defaults={{ email: state.email }}
          hidden={<>
            {portal ? <input type="hidden" name="portal" value="1" /> : null}
            {next ? <input type="hidden" name="next" value={next} /> : null}
          </>}
          linkHref={portal ? "/reset?portal=1" : "/reset"}
          switchHref={portal ? "/login" : "/portal/login"}
        />
      </EntrySurface>
    </div>
  )
}
