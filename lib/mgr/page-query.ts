// Staff server pages use the registry's permissions, including for bookmarked
// detail URLs. API callers retain the ordinary CommandError response. Each read
// logs its time (lib/server-timing.ts), since a page cannot send Server-Timing.
import { redirect } from "next/navigation";
import { canRun, CommandError, getCommandDefinition, runCommand, type Ctx } from "@/lib/commands/registry";
import { deniedHref } from "./denied";
import { logServerTiming, timeStage, type Stages } from "@/lib/server-timing";

export function requirePagePermission(ctx: Ctx, name: string, resource = name.replace(/^(get|list)_/, "").replace(/_/g, " ")) {
  const definition = getCommandDefinition(name);
  if (definition && !canRun(ctx, name)) {
    redirect(deniedHref(resource, typeof definition.roles === "string" ? [definition.roles] : definition.roles));
  }
}

/** Runs one page read and logs its time under the command name (#1490). */
async function timedRead(name: string, input: unknown, ctx: Ctx) {
  const stages: Stages = {};
  try {
    return await timeStage(stages, name, () => runCommand(name, input, ctx));
  } finally {
    logServerTiming(stages);
  }
}

export async function runPageQuery(name: string, input: unknown, ctx: Ctx) {
  requirePagePermission(ctx, name);
  return timedRead(name, input, ctx);
}

/** An enrichment read: permission still redirects, but a failed command
 *  leaves the page without that section rather than without the page. */
export async function optionalPageQuery<T>(name: string, input: unknown, ctx: Ctx): Promise<T | undefined> {
  requirePagePermission(ctx, name);
  try {
    return await timedRead(name, input, ctx) as T;
  } catch (e) {
    if (!(e instanceof CommandError)) throw e;
    console.error(name, e.message);
    return undefined;
  }
}
