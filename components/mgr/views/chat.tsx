"use client";
import { useId, useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { formatDate } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TimeWindowField } from "@/components/mgr/time-window-field";
import { TimezonePicker } from "@/components/mgr/timezone-picker";
import { timezoneLabel } from "@/lib/mgr/labels";
import { formatWindow, parseClock } from "@/lib/time-window";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { SettingsSaveStatus } from "@/components/mgr/settings-save-status";
import type { ChatHealth, ChatLinkIntent, ChatLinkedPerson, ChatPreferences } from "@/lib/commands/chat";
import { SlackMark } from "@/components/mgr/brand-icons";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatPreview, ChatPreviewPicker } from "@/lib/chat/preview-web";
import { NOTIFICATION_REASON_LABEL, type ChatPreviewFixture, type ChatPreviewId } from "@/lib/chat/contracts";
import { chatSettingIsSaved, type ChatSettingSave } from "@/lib/mgr/chat-save-feedback";
import { personalQuietHoursSchema, quietHoursWindowSchema, personalQuietHoursReason, breweryQuietHoursReason } from "@/lib/chat/quiet-hours";
import { plural } from "@/lib/mgr/plural";

const PREVIEW_TABS: [ChatPreviewId, string][] = [["app-home", "App Home"], ["personal-dm", "Personal DM"], ["team-digest", "Team digest"], ["preferences", "Sample preferences"]];

export function ChatPreviewGallery({ fixtures }: { fixtures: readonly ChatPreviewFixture[] }) {
  const [selected, setSelected] = useState<ChatPreviewId>("app-home");
  const fixture = fixtures.find(item => item.id === selected);
  return <section data-chat-preview className="flex min-w-0 flex-col gap-4" aria-label="Preview surfaces">
    {E.info("Sample data only. A preview never sends a Slack message.")}
    <Tabs value={selected} onValueChange={value => setSelected(value as ChatPreviewId)}>
      <TabsList variant="solid" className="w-full">{PREVIEW_TABS.map(([id, label]) => <TabsTrigger key={id} value={id}>{label}</TabsTrigger>)}</TabsList>
    </Tabs>
    {/* Every fixture state, for checking renderer changes while developing; staff see only the four tabs. */}
    {process.env.NODE_ENV === "development" && <details><summary>All preview states</summary><ChatPreviewPicker selected={selected} onSelect={setSelected} /></details>}
    {fixture && <ChatPreview fixture={fixture} />}
  </section>;
}

/** Admin Chat settings, shared by the app and the screen inventory. The
 *  `fields`, `connection` and `delivery` slots draw the built-in view when
 *  left undefined and draw nothing when given `null`. `people` is the Linked
 *  people section (ChatLinkedPeopleView), drawn while Slack is connected (#1509).
 *  Reading overdue after is shown read-only and links back to Settings
 *  (`backHref`), because Brewery details owns it: it drives Today as well as
 *  Slack. The sample preview waits for a connected Slack (#1509). */
export function ChatSettingsView({ health, timezone, readingDueHours, configured = true, fields, connection, delivery, people, previewFixtures = [], oauthError = false, installed = false, backHref, healthHref, disconnectHref, preferencesHref, channels = null, channel = "" }: {
  health: ChatHealth; timezone: string; readingDueHours: number; configured?: boolean; fields?: ReactNode; connection?: ReactNode; delivery?: ReactNode; people?: ReactNode; previewFixtures?: readonly ChatPreviewFixture[]; oauthError?: boolean; installed?: boolean;
  backHref?: string; healthHref?: string; disconnectHref?: string; preferencesHref?: string; channels?: { id: string; name: string }[] | null; channel?: string;
}) {
  const installation = health.installation;
  const connected = installation && !["disconnected", "pending"].includes(installation.state);
  return <>
    {E.back("Settings", "Chat", undefined, backHref)}
    {!connected && E.info("Bring today’s assigned, due and overdue work into chat. Slack shows the work; MGR stays the record.")}
    {oauthError && E.note("Slack connection was cancelled or could not finish. Try again; your existing settings remain available.", "alert")}
    {installed && E.info("Slack authorization completed. Choose a private operations channel below.")}
    {E.row(connected ? `Slack · ${installation.workspace}` : "Slack", connected ? installation.state.replaceAll("_", " ") : "Not connected", connected ? E.act("Disconnect", "destructive", disconnectHref) : "", connected && installation.state === "active" ? "ok" : "w", SlackMark)}
    <details><summary>Connection permissions</summary>{E.fld("Required scopes", "chat:write · im:write · groups:read · users:read")}{connected && E.fld("Granted scopes", installation.scopes.join(" · ") || "None recorded; reauthorize Slack")}</details>
    {installation?.lastError && E.note(`Last provider error: ${installation.lastError.replaceAll("_", " ")}`, "alert")}
    {installation?.state === "disconnected" && installation.lastError === "credential_delete_failed" && E.btn("Retry credential cleanup", "g", disconnectHref)}
    {(!connected || installation.state !== "active") && (connection !== undefined ? connection : <ChatConnectionView configured={configured} reauthorize={Boolean(connected)} />)}
    {connected && <>
      {health.destinations.map(destination => <div key={destination.id}>{E.row(`Operations channel · ${destination.channelId}`, `${destination.privacy.replaceAll("_", " ")} · ${destination.state}${destination.reason ? ` · ${destination.reason.replaceAll("_", " ")}` : ""}`)}</div>)}
      {!health.destinations.length && E.note("No operations channel selected. Eligible personal reminders can still be delivered.", "alert")}
      {fields !== undefined ? fields : <ChatSettingsFieldsView installation={installation} timezone={timezone} start={installation.quietStart?.slice(0, 5) ?? ""} end={installation.quietEnd?.slice(0, 5) ?? ""} channels={channels} channel={channel} configured={configured} delivery={null} />}
      {E.nav("Reading overdue after", `${plural(readingDueHours, "hour")} · set in Brewery details`, "", undefined, backHref)}
      {E.nav("Health", `${health.queue.retrying ?? "unavailable"} retrying · ${health.queue.queued ?? "unavailable"} queued`, "", undefined, healthHref)}
      {people}
    </>}
    {connected && previewFixtures.length > 0 && <ChatPreviewGallery fixtures={previewFixtures} />}
    {connected && (delivery !== undefined ? delivery : <ChatDeliveryView enabled={installation.state === "active"} />)}
    {E.nav("My notification preferences", "Personal reminders and quiet hours", "", undefined, preferencesHref)}
  </>;
}

export function ChatPersonalPreferencesView({ preferences, canSetQuietHours = true, back = "Chat", backHref, busy = false, saved = false, savedQuiet, error, onPreference, onDestination, onUnlink, onSaveQuiet }: {
  preferences: ChatPreferences; canSetQuietHours?: boolean; back?: string; backHref?: string; busy?: boolean; saved?: boolean; savedQuiet?: ChatSettingSave | null; error?: string | null;
  onPreference?: (reason: ChatPreferences["preferences"][number]["reason"], enabled: boolean) => void;
  onDestination?: (reason: ChatPreferences["preferences"][number]["reason"], destinationId: string) => void;
  onUnlink?: () => void; onSaveQuiet?: (start: string, end: string, timezone: string) => void;
}) {
  const id = useId();
  const [start, setStart] = useState(preferences.quietStart?.slice(0, 5) ?? "");
  const [end, setEnd] = useState(preferences.quietEnd?.slice(0, 5) ?? "");
  const [timezone, setTimezone] = useState(preferences.timezone);
  const howToLink = preferences.installationActive ? E.info("To link your Slack, open the MGR app in Slack, go to its Home tab and choose Link MGR account. Then follow that link back here.") : E.info("Slack isn’t connected for your brewery yet.");
  const breweryQuiet = preferences.breweryQuietHours;
  const quiet = personalQuietHoursSchema.safeParse({ start: start || null, end: end || null, timezone });
  const quietError = (field: string) => quiet.error?.issues.find(issue => issue.path[0] === field)?.message;
  const quietReason = personalQuietHoursReason({ start, end, timezone }, {
    start: preferences.quietStart?.slice(0, 5) ?? "", end: preferences.quietEnd?.slice(0, 5) ?? "", timezone: preferences.timezone,
  });
  return <>
    {E.back(back, "My notification preferences", undefined, backHref)}
    {preferences.link ? E.row(`Slack user ${preferences.link.external_user_id}`, "Linked to your MGR account", <Button variant="outline" disabled={busy} onClick={onUnlink}>Unlink my Slack</Button>) : howToLink}
    {E.info("These switches change only your personal Slack reminders. Your MGR work and assignments stay the same.")}
    <SettingsSaveStatus busy={busy} saved={saved} error={error} />
    {preferences.preferences.map(({ reason, enabled, personalDestinationId }) => {
      const label = NOTIFICATION_REASON_LABEL[reason];
      return <div key={reason}>
      {E.row(label, "", <Switch aria-label={label} checked={onPreference ? enabled : undefined} defaultChecked={onPreference ? undefined : enabled} disabled={busy} onCheckedChange={next => onPreference?.(reason, next)} />)}
      {Boolean(preferences.destinations?.length) && <label className="flex items-center justify-between gap-3 py-3 text-sm">{label} destination
        {E.pick(`${label} destination`, personalDestinationId ?? "", [{ value: "", label: "Default delivery", disabled: true }, ...(preferences.destinations!.map(destination => ({ value: destination.id, label: destination.external_destination_id })))], { onChange: onDestination ? (nextValue: string) => onDestination?.(reason, nextValue) : undefined, disabled: busy, hideLabel: true })}
      </label>}
      </div>;
    })}
    {E.fld("Brewery quiet hours", breweryQuiet ? `${formatWindow(parseClock(breweryQuiet.start), parseClock(breweryQuiet.end))} · ${timezoneLabel(breweryQuiet.timezone)}` : "Off")}
    {canSetQuietHours && <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); if (!busy && quiet.success && !quietReason) onSaveQuiet?.(start, end, timezone); }}>
      {E.edit("My quiet hours start", start, "time", undefined, { onChange: (nextValue: string) => setStart(nextValue), id: `${id}-start`, disabled: busy, error: quietError("start") })}
      {E.edit("My quiet hours end", end, "time", undefined, { onChange: (nextValue: string) => setEnd(nextValue), id: `${id}-end`, disabled: busy, error: quietError("end") })}
      <TimezonePicker id={`${id}-timezone`} label="My timezone" value={timezone} onChange={setTimezone} disabled={busy} />
      <CommandFormMessage error={quietError("timezone")} />
      <p className="text-sm text-muted-foreground">Clear both times to follow the brewery quiet hours. For a custom window, choose different start and end times; it can run overnight.</p>
      {E.submit("Save my quiet hours", { submitting: busy, disabled: !quiet.success, reason: quietReason })}
      <SettingsSaveStatus saved={!busy && chatSettingIsSaved(savedQuiet, { name: "set_personal_quiet_hours", start, end, timezone })} error={error} />
    </form>}
    <CommandFormMessage error={error} />
  </>;
}

export function ChatQuietHoursView({ start, end, initial = { start, end }, timezone, busy = false, saved, error, onChange, onSave }: { start: string; end: string; initial?: { start: string; end: string }; timezone: string; busy?: boolean; saved?: ChatSettingSave | null; error?: string | null; onChange?: (start: string, end: string) => void; onSave?: (start: string, end: string) => void }) {
  const id = useId(), [draft, setDraft] = useState({ start, end }), [version, setVersion] = useState(0);
  const value = onChange ? { start, end } : draft;
  const change = (start: string, end: string) => { setDraft({ start, end }); onChange?.(start, end); };
  const quiet = quietHoursWindowSchema.safeParse({ start: value.start || null, end: value.end || null });
  const reason = breweryQuietHoursReason(value, initial);
  return <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); if (!busy && quiet.success && !reason) onSave?.(value.start, value.end); }}>
    {value.start && value.end ? <TimeWindowField key={version} label="Quiet hours" start={value.start} end={value.end} step={1} disabled={busy} onChange={change} /> : E.fld("Quiet hours", value.start || value.end ? "Set both times" : "Off")}
    <details><summary>Exact times · {timezoneLabel(timezone)}</summary><div className="flex flex-col gap-3 pt-3">
      {E.edit("Brewery quiet hours start", value.start, "time", undefined, { onChange: (nextValue: string) => { change(nextValue, value.end); setVersion(version + 1); }, id: `${id}-start`, disabled: busy, error: quiet.error?.issues.find(issue => issue.path[0] === "start")?.message })}
      {E.edit("Brewery quiet hours end", value.end, "time", undefined, { onChange: (nextValue: string) => { change(value.start, nextValue); setVersion(version + 1); }, id: `${id}-end`, disabled: busy, error: quiet.error?.issues.find(issue => issue.path[0] === "end")?.message })}
      <p className="text-sm text-muted-foreground">Clear both times to turn off brewery quiet hours.</p>
    </div></details>
    <CommandFormMessage error={quiet.error?.issues[0]?.message} />
    {E.submit("Save brewery quiet hours", { submitting: busy, disabled: !quiet.success, reason })}
    <SettingsSaveStatus saved={!busy && chatSettingIsSaved(saved, { name: "set_brewery_quiet_hours", ...value })} error={error} />
  </form>;
}

/** `channels` is the list the page loaded, or null when it could not load
 *  them; picking one is the save (onChannel), and Load private channels asks
 *  again only when none were loaded (#1509). */
export function ChatSettingsFieldsView({ installation, timezone, start, end, channels, channel, configured = true, busy = false, saved, error, delivery, onLoadChannels, onChannel, onQuietChange, onSaveQuiet }: {
  installation: NonNullable<ChatHealth["installation"]>; timezone: string; start: string; end: string;
  channels: { id: string; name: string }[] | null; channel: string; configured?: boolean; busy?: boolean; saved?: ChatSettingSave | null; error?: string | null; delivery?: ReactNode;
  onLoadChannels?: () => void; onChannel?: (value: string) => void;
  onQuietChange?: (start: string, end: string) => void; onSaveQuiet?: (start: string, end: string) => void;
}) {
  const id = useId();
  return <div className="flex flex-col gap-4">
    {installation.state === "active" && <section className="flex flex-col gap-3" aria-label="Operations channel">
      {channels?.length ? <div className="flex flex-col gap-3">
        {E.pick("Operations channel", channel, channels.map(option => ({ value: option.id, label: `#${option.name} · private` })), { onChange: onChannel, disabled: busy, required: true, placeholder: "Choose a private channel", id: `${id}-channel` })}
        <SettingsSaveStatus saved={!busy && chatSettingIsSaved(saved, { name: "set_notification_destination", channel })} error={error} />
      </div> : <>
        {channels && E.note("No eligible private channels. Add MGR to a private channel with sharing turned off, then load again.")}
        <Button variant="outline" disabled={busy || !configured} onClick={onLoadChannels}>Load private channels</Button>
      </>}
      {E.note("Only active private channels with MGR added and sharing turned off are eligible. MGR checks again when you save and before delivery.")}
    </section>}
    <ChatQuietHoursView start={start} end={end} initial={{ start: installation.quietStart?.slice(0, 5) ?? "", end: installation.quietEnd?.slice(0, 5) ?? "" }} timezone={timezone} busy={busy} saved={saved} error={error} onChange={onQuietChange} onSave={onSaveQuiet} />
    {delivery !== undefined ? delivery : <ChatDeliveryView enabled={installation.state === "active"} />}
    <SettingsSaveStatus busy={busy} />
    <CommandFormMessage error={error} />
  </div>;
}

/** The Delivery switch is the one way to stop Slack sends from Chat settings (#1509). */
export function ChatDeliveryView({ enabled, busy = false, error, onDisable }: { enabled: boolean; busy?: boolean; error?: string | null; onDisable?: () => void }) {
  const [localEnabled, setLocalEnabled] = useState(enabled);
  const active = onDisable ? enabled : localEnabled;
  const disable = () => { setLocalEnabled(false); onDisable?.(); };
  return <>
    {E.row("Delivery enabled", active ? "turn off all Slack sends" : "reauthorize Slack to enable delivery", <Switch aria-label="Slack delivery" checked={active} disabled={busy || !active} onCheckedChange={checked => { if (!checked) disable(); }} />, active ? "ok" : "w")}
    <CommandFormMessage error={error} />
  </>;
}

export function ChatConnectionView({ configured = true, reauthorize = false, busy = false, error, onConnect }: { configured?: boolean; reauthorize?: boolean; busy?: boolean; error?: string | null; onConnect?: () => void }) {
  return <div className="flex flex-col gap-3">
    {!configured && E.note("Slack isn’t available for your brewery yet. Ask MGR support to turn it on, then connect here.")}
    <Button disabled={!configured || busy} onClick={onConnect}>{busy ? "Opening Slack…" : reauthorize ? "Reauthorize Slack" : "Connect Slack"}</Button>
    <CommandFormMessage error={error} />
  </div>;
}

export function ChatDisableView({ busy = false, error, onDisable }: { busy?: boolean; error?: string | null; onDisable?: () => void }) {
  return <div className="flex flex-col gap-3"><Button variant="outline" disabled={busy} onClick={onDisable}>Disable integration</Button><CommandFormMessage error={error} /></div>;
}

/** Slack health. The raw queue states are listed only once Slack is connected (#1509). */
export function ChatHealthView({ health, configured = true, connection, disable, backHref, disconnectHref }: { health: ChatHealth; configured?: boolean; connection?: ReactNode; disable?: ReactNode; backHref?: string; disconnectHref?: string }) {
  const installation = health.installation;
  const connected = installation && !["disconnected", "pending"].includes(installation.state);
  return <>
    {E.back("Chat", "Health", undefined, backHref)}
    {installation?.state === "active" ? E.info("Slack delivery is enabled. Blocked channels do not receive team digests; eligible personal sends continue.") : E.note("Slack delivery is stopped. Your MGR work remains available.")}
    {E.row("Connection", installation?.state.replaceAll("_", " ") ?? "Not connected")}
    {E.row("Last successful message from Slack", health.lastCallback ?? "None yet", health.lastCallback ? E.status("Succeeded", "ok") : "")}
    {E.row("Last successful delivery", health.lastDelivery ?? "None yet", health.lastDelivery ? E.status("Succeeded", "ok") : "")}
    {connected && Object.entries(health.queue).map(([state, count]) => <div key={state}>{E.row(state.replaceAll("_", " "), `${count} deliveries`, state === "queued" && installation?.state !== "active" ? E.status("Paused", "w") : "", count ? "w" : "")}</div>)}
    {installation?.lastError && E.note(`Last provider error: ${installation.lastError.replaceAll("_", " ")}`, "alert")}
    {installation && ["active", "disabled", "needs_reauthorization"].includes(installation.state) && (connection !== undefined ? connection : <ChatConnectionView configured={configured} reauthorize />)}
    {installation && ["active", "needs_reauthorization"].includes(installation.state) && (disable !== undefined ? disable : <ChatDisableView />)}
    {E.btn("Manage delivery", "g", backHref)}
    {installation && E.btn(installation.lastError === "credential_delete_failed" ? "Retry credential cleanup" : "Disconnect Slack", "del", disconnectHref)}
  </>;
}

export function ChatDisconnectView({ connected = true, cleanupPending = false, busy = false, error, onDisconnect }: { connected?: boolean; cleanupPending?: boolean; busy?: boolean; error?: string | null; onDisconnect?: () => void }) {
  return <div className="flex flex-col gap-4">
    {E.note("Stops: App Home, personal reminders, team digests and Slack actions.")}
    {E.info("Stays: MGR work, assignments, notification preferences and history.")}
    {cleanupPending && E.note("Slack delivery has stopped. Credential cleanup failed; retry cleanup to finish disconnecting.", "alert")}
    {connected ? <Button variant="destructive" disabled={busy} onClick={onDisconnect}>{cleanupPending ? "Retry credential cleanup" : "Disconnect Slack"}</Button> : E.info("Slack is not connected.")}
    <CommandFormMessage error={error} />
  </div>;
}

/** Chat settings' Linked people section: who linked Slack, Unlink for each,
 *  and how anyone links their own Slack, so linking and unlinking sit together (#1509). */
export function ChatLinkedPeopleView({ people, timeZone, busy = false, error, onUnlink }: { people: ChatLinkedPerson[]; timeZone: string; busy?: boolean; error?: string | null; onUnlink?: (id: string) => void }) {
  return <>
    {E.ttl("Linked people")}
    {!people.length && E.info("No current staff have linked Slack yet.")}
    {people.map(person => <div key={person.id}>{E.row(person.name, `${person.roles.join(", ")} · Slack ${person.slackIdentity} · linked ${formatDate(person.linkedAt, timeZone)}`, <Button variant="destructive" size="sm" disabled={busy} onClick={() => onUnlink?.(person.id)}>Unlink</Button>)}</div>)}
    <CommandFormMessage error={error} />
    {E.info("To link your own Slack, open the MGR app in Slack, go to its Home tab and choose Link MGR account.")}
  </>;
}

export function ChatLinkConsentView({ intent, backHref, busy = false, error, onLink }: { intent?: ChatLinkIntent | null; backHref?: string; busy?: boolean; error?: string | null; onLink?: () => void }) {
  return <>
    {E.ttl("Link your Slack")}
    {intent ? <>
      {E.info(`Slack user ${intent.slackIdentity} in ${intent.workspace} will be linked to ${intent.mgrIdentity} in ${intent.brewery}.`)}
      {E.note("This enables personal reminders and App Home. It does not change your MGR permissions.")}
      <Button data-variant="irreversible" className="bg-irreversible text-irreversible-foreground hover:bg-irreversible/90" disabled={busy} onClick={onLink}>Link accounts</Button>
    </> : E.info("This link is missing, expired, already used, or belongs to another brewery. Select the right brewery, then open the MGR app in Slack, go to its Home tab and choose Link MGR account for a fresh link.", "alert")}
    <CommandFormMessage error={error} />
    {E.btn("Back", "g", backHref)}
  </>;
}
