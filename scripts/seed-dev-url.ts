/** Refuse privileged development seeding unless the endpoint is exactly local. */
export function assertLocalSeedUrl(raw: string): void {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)
      || !["localhost", "127.0.0.1"].includes(url.hostname)
      || url.username !== "" || url.password !== "") throw new Error();
  } catch {
    throw new Error("Development seed requires a local Supabase URL");
  }
}
