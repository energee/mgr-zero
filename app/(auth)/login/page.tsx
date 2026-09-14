/**
 * Sign-in page (screen records Sign in and Session expired). Renders the
 * shadcn-based LoginForm. Arrives with `?error=` from the login action (bad
 * credentials) or from lib/commands/client.ts when a command answered 401
 * (the session ended mid-work).
 */
import { LoginForm } from "@/components/login-form"
import { CommandForm } from "@/components/mgr/command-form"
import { SessionExpiredView } from "@/components/mgr/views/session-expired"
import { sessionExpiredModel } from "@/lib/mgr/session-expired-view"

const ERRORS: Record<string, string> = {
  "1": "Incorrect email or password.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>
}) {
  const { error, sent } = await searchParams
  if (error === "expired") return <>
    <CommandForm open title="Session expired">
      <SessionExpiredView model={sessionExpiredModel} signInHref="/login" />
    </CommandForm>
    <noscript><LoginForm error="Your session expired. Sign in again." /></noscript>
  </>
  return <LoginForm error={error ? ERRORS[error] ?? "Sign-in failed." : undefined} sent={Boolean(sent)} />
}
