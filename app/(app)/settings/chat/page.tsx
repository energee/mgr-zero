// app/(app)/settings/chat/page.tsx — Admin Slack connection controls, current health and provider-free previews.
import { redirect } from "next/navigation";
import { E } from "@/components/mgr/e";
import { SlackMark } from "@/components/mgr/brand-icons";
import { getActiveBrewery } from "@/lib/brewery";
import { isChatConfigured } from "@/lib/chat/oauth";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import type { ChatHealth } from "@/lib/commands/chat";
import "@/lib/commands/all";
import { ChatConnectionAction, ChatPreviewPanel, ChatSettingsControls } from "./chat-settings-client";

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
  return <>
    {E.back("Settings", "Chat", undefined, "/settings")}
    {E.ttl("Chat notifications")}
    {E.info("Bring today’s assigned, due and overdue work into chat. Slack shows the work; MGR stays the record.")}
    {params.error && E.note("Slack connection was cancelled or could not finish. Try again; your existing settings remain available.")}
    {params.installed && E.info("Slack authorization completed. Choose a private operations channel below.")}
    {E.row(connected ? `Slack · ${installation.workspace}` : "Slack", connected ? installation.state.replaceAll("_", " ") : "Not connected", "", connected && installation.state === "active" ? "ok" : "w", SlackMark)}
    {E.fld("Required scopes", "chat:write · im:write · groups:read")}
    {connected && E.fld("Granted scopes", installation.scopes.join(" · ") || "None recorded — reauthorize Slack")}
    {installation?.lastError && E.note(`Last provider error: ${installation.lastError.replaceAll("_", " ")}`)}
    {installation?.state === "disconnected" && installation.lastError === "credential_delete_failed" && E.btn("Retry credential cleanup", "g", "/settings/chat/disconnect")}
    <div className="grid min-w-0 gap-8 xl:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        {(!connected || installation.state !== "active") && <ChatConnectionAction configured={configured} installationId={connected ? installation.id : undefined} />}
        {connected && <>
          {health.destinations.map((d) => <div key={d.id}>{E.row(`Operations channel · ${d.channelId}`, `${d.privacy.replaceAll("_", " ")} · ${d.state}${d.reason ? ` · ${d.reason.replaceAll("_", " ")}` : ""}`)}</div>)}
          {health.destinations.length === 0 && E.note("No operations channel selected. Eligible personal reminders can still be delivered.")}
          <ChatSettingsControls key={`${installation.id}:${installation.state}`} installation={installation} configured={configured} timezone={defaults.timezone} readingDueHours={defaults.fermentation_reading_due_hours} />
          {E.nav("Health", `${health.queue.retrying} retrying · ${health.queue.queued} queued`, "", undefined, "/settings/chat/health")}
          {E.nav("Linked people", `${health.linkedCount} linked`, "", undefined, "/settings/chat/people")}
          {E.btn("Disconnect", "del", "/settings/chat/disconnect")}
        </>}
        {E.nav("My notification preferences", "Personal reminders and quiet hours", "", undefined, "/settings/chat/preferences")}
      </div>
      <section className="min-w-0" aria-label="Preview surfaces">
        {E.ttl("Preview surfaces")}{E.note("Fixture data only. Previews never send Slack messages.")}<ChatPreviewPanel />
      </section>
    </div>
  </>;
}
