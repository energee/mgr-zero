import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { E } from "@/components/mgr/e";
import { buildRouteContext, isUuid } from "@/lib/commands/context";
import { CommandError, runCommand } from "@/lib/commands/registry";
import { getRequestIdentity } from "@/lib/auth/request-context";
import { serverEnv } from "@/lib/env/server";
import "@/lib/commands/all";
import { Entry } from "../entry";
import { CreateBreweryForm, type CreateBreweryState } from "./form";

async function provision(_previous: CreateBreweryState, form: FormData): Promise<CreateBreweryState> {
  "use server";
  if (serverEnv.dedicated) notFound();
  const name = form.get("name");
  const timezone = form.get("timezone");
  const ttb = form.get("ttb");
  let breweryId: string;
  try {
    const requestId = form.get("requestId");
    const actorId = form.get("actorId");
    if (typeof requestId !== "string" || !isUuid(requestId)) throw new CommandError("Invalid request ID");
    if (typeof actorId !== "string" || !isUuid(actorId)) throw new CommandError("Invalid rendered account");
    breweryId = await runCommand("provision_brewery", {
      name, timezone, ttb,
    }, await buildRouteContext(undefined, { actorId }), { requestId, correlationId: crypto.randomUUID() }) as string;
  } catch (error) {
    if (error instanceof CommandError) return {
      error: error.message,
      name: typeof name === "string" ? name : "",
      timezone: typeof timezone === "string" ? timezone : "",
      ttb: typeof ttb === "string" ? ttb : "",
    };
    throw error;
  }
  (await cookies()).set("brewery", breweryId, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  redirect("/");
}

export default async function CreateBreweryPage() {
  if (serverEnv.dedicated) notFound();
  const identity = await getRequestIdentity();
  if (!identity) redirect("/login");
  return <Entry title="Create brewery">
    {E.note("You will be the brewery’s first admin.")}
    <CreateBreweryForm action={provision} requestId={crypto.randomUUID()} actorId={identity.userId} />
  </Entry>;
}
