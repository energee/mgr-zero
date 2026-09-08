// app/(auth)/auth/confirm/route.ts — where a Supabase Auth email link lands
// (password recovery today). Exchanges the one-time code for a session cookie,
// then continues to `next` (Set new password); a used or timed-out code lands
// on Expired reset copy at /reset instead of opening the password form.
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  // Same-origin paths only: "//host" would be a protocol-relative open redirect.
  const wanted = req.nextUrl.searchParams.get("next") ?? "";
  const next = /^\/(?![\/\\])/.test(wanted) ? wanted : "/password";
  if (code) {
    const db = await createServerClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, req.url));
  }
  return NextResponse.redirect(new URL("/reset?expired=1", req.url));
}
