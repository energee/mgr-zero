// app/(auth)/portal/login/page.tsx — Portal sign in (screen record): a
// wholesale buyer enters through the same Auth boundary; the login action
// lands a customer-only account on the portal. Forgot password is a text link.
import { LoginForm } from "@/components/login-form";

const ERRORS: Record<string, string> = { "1": "Incorrect email or password." };

export default async function PortalLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <LoginForm portal error={error ? ERRORS[error] ?? "Sign-in failed." : undefined} />;
}
