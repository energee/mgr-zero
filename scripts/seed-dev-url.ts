/** Refuse privileged development seeding unless the endpoint is exactly local. */
export function assertLocalSeedUrl(raw: string): void {
  try {
    const authority = raw.match(/^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i)?.[1];
    if (authority?.includes("@")) throw new Error();
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)
      || !["localhost", "127.0.0.1"].includes(url.hostname)
      || url.username !== "" || url.password !== "") throw new Error();
  } catch {
    throw new Error("Development seed requires a local Supabase URL");
  }
}
