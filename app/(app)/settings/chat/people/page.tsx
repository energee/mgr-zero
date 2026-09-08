// app/(app)/settings/chat/people/page.tsx — Current linked staff identities and administrator unlink controls.
import { E } from "@/components/mgr/e";
import { requireAdminContext } from "@/lib/brewery";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import type { ChatLinkedPerson } from "@/lib/commands/chat";
import "@/lib/commands/all";
import { ChatLinkedPeople } from "../chat-settings-client";
export default async function ChatPeoplePage() {
  const { ctx } = await requireAdminContext("Linked people");
  const people = await runCommand("list_chat_user_links", {}, ctx) as ChatLinkedPerson[];
  return <>{E.back("Chat", "Linked people", undefined, "/settings/chat")}<ChatLinkedPeople people={people} />{E.btn("Link your Slack", "g", "/settings/chat/link")}</>;
}
