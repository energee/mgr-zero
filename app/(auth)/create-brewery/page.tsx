import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { E } from "@/components/mgr/e";
import { buildContext, isUuid } from "@/lib/commands/context";
import { CommandError, runCommand } from "@/lib/commands/registry";
import { getRequestIdentity } from "@/lib/auth/request-context";
import { serverEnv } from "@/lib/env/server";
import "@/lib/commands/all";
import { Entry } from "../entry";
import { CreateBreweryForm } from "./form";

async function provision(_previous: string | null, form: FormData): Promise<string | null> {
  "use server";
  if (serverEnv.dedicated) notFound();
  let breweryId: string;
  try {
    const requestId = form.get("requestId");
    if (typeof requestId !== "string" || !isUuid(requestId)) throw new CommandError("Invalid request ID");
    breweryId = await runCommand("provision_brewery", {
      name: form.get("name"), timezone: form.get("timezone"), ttb: form.get("ttb"),
    }, await buildContext(), { requestId, correlationId: crypto.randomUUID() }) as string;
  } catch (error) {
    if (error instanceof CommandError) return error.message;
    throw error;
  }
  (await cookies()).set("brewery", breweryId, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  redirect("/");
}

export default async function CreateBreweryPage() {
  if (serverEnv.dedicated) notFound();
  if (!(await getRequestIdentity())) redirect("/login");
  return <Entry title="Create brewery">
    {E.note("You will be the brewery’s first admin.")}
    <CreateBreweryForm action={provision} requestId={crypto.randomUUID()} />
  </Entry>;
}
