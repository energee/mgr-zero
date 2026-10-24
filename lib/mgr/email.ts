import { z } from "zod";

const email = z.string().email();

/** Match the invitation and optional vendor-email command contracts. */
export function emailError(value: string): string | undefined {
  return email.safeParse(value).success ? undefined : "Enter a valid email address, such as name@example.com.";
}
