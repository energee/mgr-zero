// app/api/command/route.ts — the single mutation endpoint. Body: { breweryId, name, input }.
import { NextResponse } from "next/server";
import { buildContext } from "@/lib/commands/context";
import { runCommand, CommandError } from "@/lib/commands/registry";
import "@/lib/commands/all"; // side-effect: registers every command

export async function POST(req: Request) {
  try {
    const { breweryId, name, input } = await req.json();
    const ctx = await buildContext(breweryId);
    return NextResponse.json({ ok: true, data: await runCommand(name, input, ctx) });
  } catch (e: unknown) {
    if (e instanceof CommandError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }
    console.error("internal error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
