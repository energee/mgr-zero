// app/api/agents/jobs/friction/route.ts — the weekly agent friction report, as markdown.
// Bearer-authenticated internal job (AGENT_FRICTION_JOB_SECRET); .github/workflows/hosted-jobs.yml
// calls it and rewrites the "Agent friction" issue, so the app itself needs no GitHub access.
import { NextResponse } from "next/server";
import { renderFrictionReport } from "@/lib/agent/friction";
import "@/lib/commands/all";
import { getCommandDefinition } from "@/lib/commands/registry";
import { authorizeJob } from "@/lib/jobs/auth";
import { readFrictionReport } from "@/lib/retention/jobs";

export async function POST(request: Request) {
  if (!authorizeJob(request, process.env.AGENT_FRICTION_JOB_SECRET)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const isOperation = (name: string) => getCommandDefinition(name) !== undefined;
    return NextResponse.json({ ok: true, markdown: renderFrictionReport(await readFrictionReport(), isOperation) });
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
