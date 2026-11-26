// tests/auth-email-templates.test.ts — the three Auth emails MGR sends (invite,
// password reset, sign-in link) share one layout and keep the link each flow
// needs. The invite test in commands-invites.test.ts reads the first href, so
// the action link must come first.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const read = (name: string) => readFileSync(`supabase/templates/${name}.html`, "utf8");
const firstHref = (html: string) => html.match(/href="([^"]+)"/)?.[1];
const INVITE_LINK = "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&audience={{ .Data.mgr_invite_kind }}";

it("puts each email's action link first", () => {
  expect(firstHref(read("invite"))).toBe(INVITE_LINK);
  expect(firstHref(read("recovery"))).toBe("{{ .ConfirmationURL }}");
  expect(firstHref(read("magic_link"))).toBe("{{ .ConfirmationURL }}");
});

it("shares one layout: only the copy between the markers differs", () => {
  const shell = (name: string) => read(name).replace(/<!-- copy -->[\s\S]*?<!-- \/copy -->/g, "").replace(/<title>[^<]*<\/title>/, "");
  expect(shell("recovery")).toBe(shell("invite"));
  expect(shell("magic_link")).toBe(shell("invite"));
});

it("registers all three with local Auth", () => {
  const config = readFileSync("supabase/config.toml", "utf8");
  for (const name of ["invite", "recovery", "magic_link"]) {
    expect(config).toContain(`content_path = "./supabase/templates/${name}.html"`);
  }
});

it("shows the MGR mark from a PNG the app serves, since mail clients do not render SVG", () => {
  expect(read("invite")).toContain('src="{{ .SiteURL }}/email/mgr-mark.png"');
  expect(readFileSync("public/email/mgr-mark.png").subarray(1, 4).toString()).toBe("PNG");
});
