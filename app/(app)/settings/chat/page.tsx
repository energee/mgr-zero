// Admin reads remain at the existing authorized command boundary.
import { redirect } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { isSlackConfigured } from "@/lib/chat/oauth";
import { buildContext } from "@/lib/commands/context";
import { optionalPageQuery, runPageQuery as runCommand } from "@/lib/mgr/page-query";
import type { ChatHealth, ChatLinkedPerson } from "@/lib/commands/chat";
import { CHAT_PREVIEW_FIXTURES } from "@/lib/chat/preview-fixtures";
import { ChatSettingsView } from "@/components/mgr/views/chat";
import "@/lib/commands/all";
import { ChatConnectionAction, ChatSettingsControls, ChatDelivery, ChatLinkedPeople } from "./chat-settings-client";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/settings/chat") };

export default async function ChatSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; installed?: string }> }) {
  const brewery = await getActiveBrewery();
  if (!brewery.roles.includes("admin")) redirect("/settings/chat/preferences");
  const ctx = await buildContext(brewery.id);
  const [health, defaults, params] = await Promise.all([
    runCommand("get_chat_integration_health", {}, ctx) as Promise<ChatHealth>,
    runCommand("get_brewery_operating_defaults", {}, ctx) as Promise<{ timezone: string; fermentation_reading_due_hours: number }>, searchParams,
  ]);
  const installation = health.installation;
  const configured = isSlackConfigured();
  const connected = installation && !["disconnected", "pending"].includes(installation.state);
  // Channels and linked people load with the page (#1509). A failed channel
  // read leaves Load private channels; a failed people read leaves the section out.
  const [channels, people] = connected ? await Promise.all([
    installation.state === "active" && configured ? optionalPageQuery<{ id: string; name: string }[]>("list_chat_channels", { installationId: installation.id }, ctx) : undefined,
    optionalPageQuery<ChatLinkedPerson[]>("list_chat_user_links", {}, ctx),
  ]) : [];
  // Each element slot carries a key: ChatSettingsView places it among its own
  // siblings, where an unkeyed server element trips React's list-key warning (#493).
  return <ChatSettingsView health={health} configured={configured} timezone={defaults.timezone} readingDueHours={defaults.fermentation_reading_due_hours}
    oauthError={Boolean(params.error)} installed={Boolean(params.installed)} previewFixtures={CHAT_PREVIEW_FIXTURES}
    backHref="/settings" healthHref="/settings/chat/health" disconnectHref="/settings/chat/disconnect" preferencesHref="/settings/chat/preferences"
    connection={<ChatConnectionAction key="connection" configured={configured} installationId={connected ? installation.id : undefined} />}
    fields={connected ? <ChatSettingsControls key={installation.id + ":" + installation.state} installation={installation} configured={configured} timezone={defaults.timezone} channels={channels ?? null} channel={health.destinations[0]?.channelId ?? ""} /> : null}
    people={people && <ChatLinkedPeople key="people" people={people} timeZone={brewery.timeZone} />}
    delivery={installation && ["active", "needs_reauthorization"].includes(installation.state) ? <ChatDelivery key="delivery" installationId={installation.id} enabled={installation.state === "active"} /> : undefined}
  />;
}
