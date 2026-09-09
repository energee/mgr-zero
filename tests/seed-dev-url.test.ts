import { describe, expect, it } from "vitest";
import { assertLocalSeedUrl } from "@/scripts/seed-dev-url";

describe("development seed URL guard", () => {
  it.each(["http://localhost:54321", "https://localhost", "http://127.0.0.1:54321"])("allows %s", (url) => expect(() => assertLocalSeedUrl(url)).not.toThrow());
  it.each(["https://project.supabase.co", "http://localhost.evil.test", "http://user:pass@localhost:54321", "ftp://localhost/x", "not a url"])("refuses %s", (url) => expect(() => assertLocalSeedUrl(url)).toThrow(/local Supabase/));
});
