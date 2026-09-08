// app/(auth)/portal/login/page.tsx — Portal sign in (screen record): a
// wholesale buyer enters through the same Auth boundary; the login action
// lands a customer-only account on the portal. Forgot password is a text link.
import { LoginForm } from "@/components/login-form";

const ERRORS: Record<string, string> = { "1": "Incorrect email or password." };

export default async function PortalLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm portal error={error ? ERRORS[error] ?? "Sign-in failed." : undefined} />
      </div>
    </div>
  );
}
