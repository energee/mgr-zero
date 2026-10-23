// app/(app)/settings/chat/preferences/page.tsx — Current staff member’s personal Slack reasons, quiet hours and link.
import { getActiveBrewery } from "@/lib/brewery";
import { isSlackConfigured } from "@/lib/chat/oauth";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import type { ChatPreferences } from "@/lib/commands/chat";
import "@/lib/commands/all";
import { ChatPersonalPreferences } from "../chat-settings-client";
import { onlyRoles } from "@/lib/mgr/roles";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/settings/chat/preferences") };

export default async function ChatPreferencesPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const preferences = await runCommand("get_notification_preferences", {}, ctx) as ChatPreferences;
  return <ChatPersonalPreferences key={brewery.id} preferences={preferences} configured={isSlackConfigured()} canSetQuietHours={!onlyRoles(brewery.roles, ["taproom"])} back={brewery.roles.includes("admin") ? "Chat" : "More"} backHref={brewery.roles.includes("admin") ? "/settings/chat" : "/more"} />;
}
