/** Existing command phone policy: optional, 7–15 digits, customary punctuation and a leading +. */
export function phoneError(value: string): string | undefined {
  const phone = value.trim();
  if (phone === "" || /^\+?\d{7,15}$/.test(phone.replace(/[\s().-]/g, ""))) return undefined;
  return "Use a phone number, such as (503) 555-0142.";
}
