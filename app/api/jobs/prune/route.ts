// app/api/jobs/prune/route.ts — scheduler wake for data retention (#766).
// Bearer-authenticated internal job (RETENTION_JOB_SECRET); the scheduler is hosted config.
import { NextResponse } from "next/server";
import { authorizeJob } from "@/lib/jobs/auth";
import { pruneCommandRequests } from "@/lib/retention/jobs";

export async function POST(request: Request) {
  if (!authorizeJob(request, process.env.RETENTION_JOB_SECRET)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, pruned: await pruneCommandRequests() });
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
