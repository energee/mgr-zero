// app/(app)/settings/chat/preferences/page.tsx — Current staff member’s personal Slack reasons, quiet hours and link.
import { E } from "@/components/mgr/e";
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
  return <>{E.back(brewery.role === "admin" ? "Chat" : "More", "My notification preferences", undefined, brewery.role === "admin" ? "/settings/chat" : "/more")}<ChatPersonalPreferences key={brewery.id} preferences={preferences} canSetQuietHours={brewery.role !== "taproom"} /></>;
}
