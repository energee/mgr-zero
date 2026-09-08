// app/(auth)/auth/confirm/route.ts — where a Supabase Auth email link lands
// (password recovery today). Exchanges the one-time code for a session cookie,
// then continues to `next` (Set new password); a used or timed-out code lands
// on Expired reset copy at /reset instead of opening the password form.
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { inviteAudience } from "@/lib/auth/invite";
import { publicEnv } from "@/lib/env/public";

function authClient(req: NextRequest) {
  const pending: { name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] }[] = [];
  const db = createServerClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    cookies: { getAll: () => req.cookies.getAll(), setAll: (cookies) => { pending.push(...cookies); } },
  });
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, req.url));
    pending.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    return response;
  };
  return { db, redirect };
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  const type = req.nextUrl.searchParams.get("type");
  const audience = inviteAudience(req.nextUrl.searchParams.get("audience"));
  // Same-origin paths only: "//host" would be a protocol-relative open redirect.
  const wanted = req.nextUrl.searchParams.get("next") ?? "";
  const next = /^\/(?![\/\\])/.test(wanted) ? wanted : "/password";
  if (tokenHash || type === "invite") {
    if (!tokenHash || type !== "invite" || !audience) return NextResponse.redirect(new URL("/invite-expired", req.url));
    const { db, redirect } = authClient(req);
    const { data, error } = await db.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
    const kind = data.user?.user_metadata?.mgr_invite_kind;
    if (!error && kind === audience) return redirect(`/accept?audience=${audience}`);
    if (!error) await db.auth.signOut();
    return redirect("/invite-expired");
  }
  if (code) {
    const { db, redirect } = authClient(req);
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return redirect(next);
  }
  return NextResponse.redirect(new URL("/reset?expired=1", req.url));
}
