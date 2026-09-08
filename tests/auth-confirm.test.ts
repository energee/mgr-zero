import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/(auth)/auth/confirm/route";
import { makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

const mailpit = () => {
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  url.port = String(Number(url.port) + 3);
  return url;
};

async function inviteLink(email: string) {
  const url = mailpit();
  url.pathname = "/api/v1/search";
  url.searchParams.set("query", `to:${email}`);
  const mail = await fetch(url).then((response) => response.json());
  const message = await fetch(`${url.origin}/api/v1/message/${mail.messages[0].ID}`).then((response) => response.json());
  return new URL(message.HTML.match(/href="([^"]+)"/)[1].replaceAll("&amp;", "&"));
}

describe("Auth confirmation callback", () => {
  let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
  beforeAll(async () => { ctx = await makeStaffCtx((await makeBrewery()).id); });

  it("sets a session cookie once, then rejects replay", async () => {
    const email = `${crypto.randomUUID()}@test.local`;
    await runCommand("invite_staff", { email, role: "warehouse" }, ctx);
    const link = await inviteLink(email);
    const first = await GET(new NextRequest(link));
    expect(first.headers.get("location")).toContain("/accept?audience=staff");
    expect(first.headers.get("set-cookie")).toContain("auth-token");
    const replay = await GET(new NextRequest(link));
    expect(replay.headers.get("location")).toContain("/invite-expired");
  });

  it("clears the verified session for a wrong audience", async () => {
    const email = `${crypto.randomUUID()}@test.local`;
    await runCommand("invite_staff", { email, role: "warehouse" }, ctx);
    const link = await inviteLink(email);
    link.searchParams.set("audience", "customer");
    const response = await GET(new NextRequest(link));
    expect(response.headers.get("location")).toContain("/invite-expired");
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).not.toMatch(/auth-token=[^;,]+eyJ/);
    expect(cookies).toMatch(/Max-Age=0/);
  });
});
