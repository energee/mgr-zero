/**
 * Sign-in page (screen records Sign in and Session expired). Renders the
 * shadcn-based LoginForm. Arrives with `?error=` from the login action (bad
 * credentials) or from lib/commands/client.ts when a command answered 401
 * (the session ended mid-work).
 */
import { LoginForm } from "@/components/login-form"

const ERRORS: Record<string, string> = {
  "1": "Incorrect email or password.",
  "expired": "Your session ended. Sign in to retry.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return <LoginForm error={error ? ERRORS[error] ?? "Sign-in failed." : undefined} />
}
