import type { Database } from "@/lib/supabase/database";
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env/public";

// Next.js proxy (formerly `middleware`) refreshes Supabase cookies before routes
// render. Both the request and response receive refreshed cookies so the current
// request uses the new token and the browser persists it.
export async function proxy(req: NextRequest) {
  req.headers.set("x-mgr-path", req.nextUrl.pathname + req.nextUrl.search);
  let res = NextResponse.next({ request: { headers: req.headers } });
  const supabase = createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));

        const existingHeaders = new Headers(res.headers);
        res = NextResponse.next({ request: { headers: req.headers } });
        existingHeaders.forEach((value, name) => {
          if (!name.startsWith("x-middleware-")) res.headers.set(name, value);
        });
        cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => res.headers.set(name, value));
      },
    },
  });

  // getClaims refreshes an expired session like getUser, but verifies the JWT
  // locally against the project's signing keys instead of calling Supabase Auth
  // on every navigation (it falls back to getUser for a symmetric-key project).
  await supabase.auth.getClaims();
  return res;
}

// Skip static assets: a session refresh is a Supabase round-trip, and an SVG
// from /public doesn't need one, and neither do the public customer guides at /docs
// (the chooser itself included) or the search endpoint that backs their ⌘K dialog.
// /api/command refreshes its own cookie session (buildRouteContext's getClaims sets
// the cookies); running the proxy first only added a second check and, on a cold
// request, a second function start of about 0.85 s (#1403).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|docs(?:/|$)|screens/frame/|api/search|api/command$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|html)$).*)"],
};
