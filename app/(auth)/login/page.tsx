/**
 * Sign-in page. Renders the shadcn-based LoginForm. Arrives with `?error=`
 * from the login action (bad credentials) or from getActiveBrewery (signed
 * in, but not a member of any brewery).
 */
import { LoginForm } from "@/components/login-form"

const ERRORS: Record<string, string> = {
  "1": "Incorrect email or password.",
  "no-membership": "Your account isn't a member of any brewery yet. Ask an admin for an invitation.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm error={error ? ERRORS[error] ?? "Sign-in failed." : undefined} />
      </div>
    </div>
  )
}
