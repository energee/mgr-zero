import { z } from "zod";

/** An email address within RFC 5321's limits, which Auth also enforces (#1419): 64 characters before the @, 254 in total. */
export const email = z.string()
  .email("Enter a valid email address, such as name@example.com.")
  .refine((v) => v.length <= 254 && v.indexOf("@") <= 64, "Use at most 64 characters before the @ and 254 in total.");

/** Match the invitation and optional vendor-email command contracts. */
export function emailError(value: string): string | undefined {
  return email.safeParse(value).error?.issues[0].message;
}
