// Staff server pages use the registry's permissions, including for bookmarked
// detail URLs. API callers retain the ordinary CommandError response.
import { redirect } from "next/navigation";
import { canRun, CommandError, getCommandDefinition, runCommand, type Ctx } from "@/lib/commands/registry";
import { deniedHref } from "./denied";

export function requirePagePermission(ctx: Ctx, name: string, resource = name.replace(/^(get|list)_/, "").replace(/_/g, " ")) {
  const definition = getCommandDefinition(name);
  if (definition && !canRun(ctx, name)) {
    redirect(deniedHref(resource, Array.isArray(definition.roles) ? definition.roles : [definition.roles]));
  }
}

export async function runPageQuery(name: string, input: unknown, ctx: Ctx) {
  requirePagePermission(ctx, name);
  return runCommand(name, input, ctx);
}

/** An enrichment read: permission still redirects, but a failed command
 *  leaves the page without that section rather than without the page. */
export async function optionalPageQuery<T>(name: string, input: unknown, ctx: Ctx): Promise<T | undefined> {
  requirePagePermission(ctx, name);
  try {
    return await runCommand(name, input, ctx) as T;
  } catch (e) {
    if (!(e instanceof CommandError)) throw e;
    console.error(name, e.message);
    return undefined;
  }
}
