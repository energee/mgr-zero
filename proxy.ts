import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env/public";

// Next.js proxy (formerly `middleware`) refreshes Supabase cookies before routes
// render. Both the request and response receive refreshed cookies so the current
// request uses the new token and the browser persists it.
export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));

        const existingHeaders = new Headers(res.headers);
        res = NextResponse.next({ request: req });
        existingHeaders.forEach((value, name) => {
          if (!name.startsWith("x-middleware-")) res.headers.set(name, value);
        });
        cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => res.headers.set(name, value));
      },
    },
  });

  await supabase.auth.getUser();
  return res;
}

// Skip static assets: a session refresh is a Supabase round-trip, and an SVG
// from /public doesn't need one, and neither do the public customer guides at /docs/*.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|docs/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|html)$).*)"],
};
