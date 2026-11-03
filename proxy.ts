import type { Database } from "@/lib/supabase/database";
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env/public";
import { serverTiming, timeStage, type Stages } from "@/lib/server-timing";

// Next.js proxy (formerly `middleware`) refreshes Supabase cookies before routes
// render. Both the request and response receive refreshed cookies so the current
// request uses the new token and the browser persists it.
export async function proxy(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = `frame-ancestors 'self'; object-src 'none'; base-uri 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`;
  // Next reads the request CSP to nonce its framework scripts. Replace client
  // values rather than allowing a caller to choose the trusted script nonce.
  req.headers.set("x-nonce", nonce);
  req.headers.set("Content-Security-Policy", csp);
  req.headers.set("x-mgr-path", req.nextUrl.pathname + req.nextUrl.search);
  let res = NextResponse.next({ request: { headers: req.headers } });
  res.headers.set("Content-Security-Policy", csp);

  // Public guides, frames and asset paths need no session refresh. Unknown
  // asset paths can still render HTML, so they receive the document CSP above.
  const pathname = req.nextUrl.pathname;
  if (pathname === "/docs" || pathname.startsWith("/docs/") || pathname.startsWith("/screens/frame/") ||
      pathname.startsWith("/mock/") || pathname.startsWith("/_next/static/")) return res;
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
  // Its time is the page load's session stage in Server-Timing (#1490).
  const stages: Stages = {};
  await timeStage(stages, "session", () => supabase.auth.getClaims());
  res.headers.set("Server-Timing", serverTiming(stages));
  return res;
}

// A suffix does not identify a resource: unknown .js URLs can render HTML 404s.
// Skip browser subresources and exact non-document endpoints, not navigations.
// /api/command refreshes its own session.
export const config = {
  matcher: [{
    source: "/((?!_next/image$|favicon\\.ico$|icon\\.svg$|api/search$|api/command$).*)",
    missing: [{ type: "header", key: "sec-fetch-dest", value: "(?:font|image|script|style)" }],
  }],
};
