// Admin reads remain at the existing authorized command boundary.
import { redirect } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { isChatConfigured } from "@/lib/chat/oauth";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import type { ChatHealth } from "@/lib/commands/chat";
import { CHAT_PREVIEW_FIXTURES } from "@/lib/chat/preview-fixtures";
import { ChatSettingsView } from "@/components/mgr/views/chat";
import "@/lib/commands/all";
import { ChatConnectionAction, ChatSettingsControls, ChatDelivery } from "./chat-settings-client";

export default async function ChatSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; installed?: string }> }) {
  const brewery = await getActiveBrewery();
  if (brewery.role !== "admin") redirect("/settings/chat/preferences");
  const ctx = await buildContext(brewery.id);
  const [health, defaults, params] = await Promise.all([
    runCommand("get_chat_integration_health", {}, ctx) as Promise<ChatHealth>,
    runCommand("get_brewery_operating_defaults", {}, ctx) as Promise<{ timezone: string; fermentation_reading_due_hours: number }>, searchParams,
  ]);
  const installation = health.installation;
  const configured = isChatConfigured();
  const connected = installation && !["disconnected", "pending"].includes(installation.state);
  return <ChatSettingsView health={health} configured={configured} timezone={defaults.timezone} readingDueHours={defaults.fermentation_reading_due_hours}
    oauthError={Boolean(params.error)} installed={Boolean(params.installed)} previewFixtures={CHAT_PREVIEW_FIXTURES}
    backHref="/settings" healthHref="/settings/chat/health" peopleHref="/settings/chat/people" disconnectHref="/settings/chat/disconnect" preferencesHref="/settings/chat/preferences"
    connection={<ChatConnectionAction configured={configured} installationId={connected ? installation.id : undefined} />}
    fields={connected ? <ChatSettingsControls key={installation.id + ":" + installation.state} installation={installation} configured={configured} timezone={defaults.timezone} readingDueHours={defaults.fermentation_reading_due_hours} /> : null}
    delivery={installation && ["active", "needs_reauthorization"].includes(installation.state) ? <ChatDelivery installationId={installation.id} enabled={installation.state === "active"} /> : undefined}
  />;
}
