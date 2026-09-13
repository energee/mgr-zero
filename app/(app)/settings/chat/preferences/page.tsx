// app/(app)/settings/chat/preferences/page.tsx — Current staff member’s personal Slack reasons, quiet hours and link.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import type { ChatPreferences } from "@/lib/commands/chat";
import "@/lib/commands/all";
import { ChatPersonalPreferences } from "../chat-settings-client";
export default async function ChatPreferencesPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const preferences = await runCommand("get_notification_preferences", {}, ctx) as ChatPreferences;
  return <ChatPersonalPreferences key={brewery.id} preferences={preferences} canSetQuietHours={brewery.role !== "taproom"} back={brewery.role === "admin" ? "Chat" : "More"} backHref={brewery.role === "admin" ? "/settings/chat" : "/more"} />;
}
