// app/(app)/settings/chat/preferences/page.tsx — Current staff member’s personal Slack reasons, quiet hours and link.
// Non-admins open it from the Me sheet, which is not a page, so their back link goes to Today.
import { getActiveBrewery } from "@/lib/brewery";
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
  return <ChatPersonalPreferences key={brewery.id} preferences={preferences} canSetQuietHours={!onlyRoles(brewery.roles, ["taproom"])} back={brewery.roles.includes("admin") ? "Chat" : "Today"} backHref={brewery.roles.includes("admin") ? "/settings/chat" : "/"} />;
}
