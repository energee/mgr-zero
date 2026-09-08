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
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { login } from "@/app/(auth)/actions"
import { MgrIcon } from "@/components/mgr-icon"
import Link from "next/link"

export function LoginForm({
  className,
  error,
  portal,
  ...props
}: React.ComponentProps<"div"> & { error?: string; portal?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <MgrIcon size={40} className="mx-auto" />
          <CardTitle className="text-xl">{portal ? "Sign in to your account" : "Sign in to MGR"}</CardTitle>
          <CardDescription>{portal ? "Wholesale ordering" : "Brewery operations management"}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={login}>
            <FieldGroup>
              {portal && <input type="hidden" name="portal" value="1" />}
              {error && (
                <p
                  role="alert"
                  className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              )}
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@brewery.com"
                  autoComplete="email"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <Field>
                <Button type="submit">Sign in</Button>
                <FieldDescription className="text-center">
                  <Link href={portal ? "/reset?portal=1" : "/reset"} className="underline">Forgot password?</Link>
                  {portal ? " Accounts are created by your brewery." : " Accounts are created by invitation. Ask an admin at your brewery for access."}
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
