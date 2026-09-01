// app/api/command/route.ts — the single HTTP API. Body: { breweryId, name, input }.
// Auth: browser cookie session, or Authorization: Bearer <supabase access_token>.
import { NextResponse } from "next/server";
import { buildContext, buildContextFromBearer } from "@/lib/commands/context";
import { runCommand, CommandError } from "@/lib/commands/registry";
import "@/lib/commands/all"; // side-effect: registers every command

// null = no Authorization header (use the cookie session); "" = a header that
// is present but malformed, which must fail closed as 401 rather than fall
// back to cookies — keep the null/"" distinction.
function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token, extra] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer" || !token || extra) return "";
  return token;
}

export async function POST(req: Request) {
  try {
    const { breweryId, name, input } = await req.json();
    const token = bearerToken(req);
    const ctx = token === null ? await buildContext(breweryId) : await buildContextFromBearer(breweryId, token);
    return NextResponse.json({ ok: true, data: await runCommand(name, input, ctx) });
  } catch (e: unknown) {
    if (e instanceof CommandError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    console.error("internal error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
