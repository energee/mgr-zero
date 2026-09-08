// app/(app)/settings/chat/people/page.tsx — Current linked staff identities and administrator unlink controls.
import { redirect } from "next/navigation";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { deniedHref } from "@/lib/mgr/denied";
import type { ChatLinkedPerson } from "@/lib/commands/chat";
import "@/lib/commands/all";
import { ChatLinkedPeople } from "../chat-settings-client";
export default async function ChatPeoplePage() {
  const brewery = await getActiveBrewery();
  if (brewery.role !== "admin") redirect(deniedHref("Linked people", ["admin"]));
  const ctx = await buildContext(brewery.id);
  const people = await runCommand("list_chat_user_links", {}, ctx) as ChatLinkedPerson[];
  return <>{E.back("Chat", "Linked people", undefined, "/settings/chat")}<ChatLinkedPeople people={people} />{E.btn("Link your Slack", "g", "/settings/chat/link")}</>;
}
