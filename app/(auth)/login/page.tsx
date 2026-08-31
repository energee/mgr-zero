/**
 * Sign-in page. Renders the shadcn-based LoginForm; the `login` server action
 * redirects here with `?error=1` when credentials are rejected.
 */
import { LoginForm } from "@/components/login-form"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm error={error === "1"} />
      </div>
    </div>
  )
}
