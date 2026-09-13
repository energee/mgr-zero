"use client";
import { useId, useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimeWindowField } from "@/components/mgr/time-window-field";
import { CommandFormMessage } from "@/components/mgr/command-form";
import type { ChatHealth, ChatLinkIntent, ChatLinkedPerson, ChatPreferences } from "@/lib/commands/chat";
import { SlackMark } from "@/components/mgr/brand-icons";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatPreview, ChatPreviewPicker } from "@/lib/chat/preview-web";
import type { ChatPreviewFixture, ChatPreviewId } from "@/lib/chat/contracts";

export function ChatPreviewGallery({ fixtures }: { fixtures: readonly ChatPreviewFixture[] }) {
  const [selected, setSelected] = useState<ChatPreviewId>("app-home");
  const fixture = fixtures.find(item => item.id === selected);
  return <section data-chat-preview className="flex min-w-0 flex-col gap-4" aria-label="Preview surfaces">
    {E.note("Fixture data only. Previews never send Slack messages.")}
    <Tabs value={selected} onValueChange={value => setSelected(value as ChatPreviewId)}>
      <TabsList variant="solid" className="w-full">{[["app-home", "App Home"], ["personal-dm", "Personal DM"], ["team-digest", "Team digest"], ["preferences", "Preferences"]].map(([id, label]) => <TabsTrigger key={id} value={id}>{label}</TabsTrigger>)}</TabsList>
    </Tabs>
    <details><summary>All preview states</summary><ChatPreviewPicker selected={selected} onSelect={setSelected} /></details>
    {fixture && <ChatPreview fixture={fixture} />}
  </section>;
}

export function ChatSettingsView({ health, timezone, readingDueHours, configured = true, fields, connection, delivery, previewFixtures = [], oauthError = false, installed = false, backHref, healthHref, peopleHref, disconnectHref, preferencesHref, channels = null, channel = "" }: {
  health: ChatHealth; timezone: string; readingDueHours: number; configured?: boolean; fields?: ReactNode; connection?: ReactNode; delivery?: ReactNode; previewFixtures?: readonly ChatPreviewFixture[]; oauthError?: boolean; installed?: boolean;
  backHref?: string; healthHref?: string; peopleHref?: string; disconnectHref?: string; preferencesHref?: string; channels?: { id: string; name: string }[] | null; channel?: string;
}) {
  const installation = health.installation;
  const connected = installation && !["disconnected", "pending"].includes(installation.state);
  return <>
    {E.back("Settings", "Chat", undefined, backHref)}
    {!connected && <>{E.ttl("Chat notifications")}{E.info("Bring today’s assigned, due and overdue work into chat. Slack shows the work; MGR stays the record.")}</>}
    {oauthError && E.note("Slack connection was cancelled or could not finish. Try again; your existing settings remain available.")}
    {installed && E.info("Slack authorization completed. Choose a private operations channel below.")}
    {E.row(connected ? `Slack · ${installation.workspace}` : "Slack", connected ? installation.state.replaceAll("_", " ") : "Not connected", connected ? E.act("Disconnect", "destructive", disconnectHref) : "", connected && installation.state === "active" ? "ok" : "w", SlackMark)}
    <details><summary>Connection permissions</summary>{E.fld("Required scopes", "chat:write · im:write · groups:read")}{connected && E.fld("Granted scopes", installation.scopes.join(" · ") || "None recorded; reauthorize Slack")}</details>
    {installation?.lastError && E.note(`Last provider error: ${installation.lastError.replaceAll("_", " ")}`)}
    {installation?.state === "disconnected" && installation.lastError === "credential_delete_failed" && E.btn("Retry credential cleanup", "g", disconnectHref)}
    {(!connected || installation.state !== "active") && (connection !== undefined ? connection : <ChatConnectionView configured={configured} reauthorize={Boolean(connected)} />)}
    {connected && <>
      {health.destinations.map(destination => <div key={destination.id}>{E.row(`Operations channel · ${destination.channelId}`, `${destination.privacy.replaceAll("_", " ")} · ${destination.state}${destination.reason ? ` · ${destination.reason.replaceAll("_", " ")}` : ""}`)}</div>)}
      {!health.destinations.length && E.note("No operations channel selected. Eligible personal reminders can still be delivered.")}
      {fields !== undefined ? fields : <ChatSettingsFieldsView installation={installation} timezone={timezone} hours={String(readingDueHours)} start={installation.quietStart?.slice(0, 5) ?? ""} end={installation.quietEnd?.slice(0, 5) ?? ""} channels={channels} channel={channel} configured={configured} delivery={null} />}
      {E.nav("Health", `${health.queue.retrying ?? "unavailable"} retrying · ${health.queue.queued ?? "unavailable"} queued`, "", undefined, healthHref)}
      {E.nav("Linked people", `${health.linkedCount} linked`, "", undefined, peopleHref)}
    </>}
    {previewFixtures.length > 0 && <ChatPreviewGallery fixtures={previewFixtures} />}
    {connected && (delivery !== undefined ? delivery : <ChatDeliveryView enabled={installation.state === "active"} canDisable={["active", "needs_reauthorization"].includes(installation.state)} />)}
    {E.nav("My notification preferences", "Personal reminders and quiet hours", "", undefined, preferencesHref)}
  </>;
}

export function ChatPersonalPreferencesView({ preferences, canSetQuietHours = true, back = "Chat", backHref, busy = false, error, onPreference, onDestination, onUnlink, onSaveQuiet }: {
  preferences: ChatPreferences; canSetQuietHours?: boolean; back?: string; backHref?: string; busy?: boolean; error?: string | null;
  onPreference?: (reason: ChatPreferences["preferences"][number]["reason"], enabled: boolean) => void;
  onDestination?: (reason: ChatPreferences["preferences"][number]["reason"], destinationId: string) => void;
  onUnlink?: () => void; onSaveQuiet?: (start: string, end: string, timezone: string) => void;
}) {
  const id = useId();
  const [start, setStart] = useState(preferences.quietStart?.slice(0, 5) ?? "");
  const [end, setEnd] = useState(preferences.quietEnd?.slice(0, 5) ?? "");
  const [timezone, setTimezone] = useState(preferences.timezone);
  return <>
    {E.back(back, "My notification preferences", undefined, backHref)}
    {preferences.link ? E.row(`Slack user ${preferences.link.external_user_id}`, "Linked to your MGR account", <Button variant="outline" disabled={busy} onClick={onUnlink}>Unlink my Slack</Button>) : E.info("To link your Slack, open MGR’s App Home in Slack and choose Link MGR account. Return here using that fresh link.")}
    {E.note("These preferences change your personal reminders. MGR work, assignments and App Home stay the same.")}
    {preferences.preferences.map(preference => <div key={preference.reason}>
      {E.row(preference.reason.replaceAll("_", " "), "Personal reminders", <Switch aria-label={preference.reason.replaceAll("_", " ")} checked={onPreference ? preference.enabled : undefined} defaultChecked={onPreference ? undefined : preference.enabled} disabled={busy} onCheckedChange={enabled => onPreference?.(preference.reason, enabled)} />)}
      {Boolean(preferences.destinations?.length) && <label className="flex items-center justify-between gap-3 py-3 text-sm">{preference.reason.replaceAll("_", " ")} destination
        <select aria-label={`${preference.reason.replaceAll("_", " ")} destination`} value={onDestination ? preference.personalDestinationId ?? "" : undefined} defaultValue={onDestination ? undefined : preference.personalDestinationId ?? ""} disabled={busy} onChange={event => onDestination?.(preference.reason, event.target.value)}>
          <option value="" disabled>Default delivery</option>{preferences.destinations!.map(destination => <option key={destination.id} value={destination.id}>{destination.external_destination_id}</option>)}
        </select>
      </label>}
    </div>)}
    {canSetQuietHours && <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); if (!busy && Boolean(start) === Boolean(end)) onSaveQuiet?.(start, end, timezone); }}>
      <Label htmlFor={`${id}-start`}>My quiet hours start</Label><Input id={`${id}-start`} type="time" value={start} disabled={busy} onChange={event => setStart(event.target.value)} />
      <Label htmlFor={`${id}-end`}>My quiet hours end</Label><Input id={`${id}-end`} type="time" value={end} disabled={busy} onChange={event => setEnd(event.target.value)} />
      <Label htmlFor={`${id}-timezone`}>My timezone</Label><Input id={`${id}-timezone`} value={timezone} disabled={busy} onChange={event => setTimezone(event.target.value)} required />
      <p className="text-sm text-muted-foreground">Clear both times to follow the brewery quiet hours.</p><Button disabled={busy || Boolean(start) !== Boolean(end)}>Save my quiet hours</Button>
    </form>}
    <CommandFormMessage error={error} />
  </>;
}

export function ChatQuietHoursView({ start, end, timezone, busy = false, onChange, onSave }: { start: string; end: string; timezone: string; busy?: boolean; onChange?: (start: string, end: string) => void; onSave?: (start: string, end: string) => void }) {
  const id = useId(), [draft, setDraft] = useState({ start, end }), [version, setVersion] = useState(0);
  const value = onChange ? { start, end } : draft;
  const change = (start: string, end: string) => { setDraft({ start, end }); onChange?.(start, end); };
  return <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); if (!busy && Boolean(value.start) === Boolean(value.end)) onSave?.(value.start, value.end); }}>
    {value.start && value.end ? <TimeWindowField key={version} label="Quiet hours" start={value.start} end={value.end} step={1} disabled={busy} onChange={change} /> : E.fld("Quiet hours", value.start || value.end ? "Set both times" : "Off")}
    <details><summary>Exact times · {timezone}</summary><div className="flex flex-col gap-3 pt-3">
      <Label htmlFor={`${id}-start`}>Brewery quiet hours start</Label><Input id={`${id}-start`} type="time" value={value.start} disabled={busy} onChange={event => { change(event.target.value, value.end); setVersion(version + 1); }} />
      <Label htmlFor={`${id}-end`}>Brewery quiet hours end</Label><Input id={`${id}-end`} type="time" value={value.end} disabled={busy} onChange={event => { change(value.start, event.target.value); setVersion(version + 1); }} />
      <p className="text-sm text-muted-foreground">Clear both times to turn off brewery quiet hours.</p>
    </div></details>
    <Button disabled={busy || Boolean(value.start) !== Boolean(value.end)}>Save brewery quiet hours</Button>
  </form>;
}

export function ChatSettingsFieldsView({ installation, timezone, hours, start, end, channels, channel, configured = true, busy = false, error, delivery, onLoadChannels, onChannel, onSaveChannel, onQuietChange, onSaveQuiet, onHours, onSaveHours }: {
  installation: NonNullable<ChatHealth["installation"]>; timezone: string; hours: string; start: string; end: string;
  channels: { id: string; name: string }[] | null; channel: string; configured?: boolean; busy?: boolean; error?: string | null; delivery?: ReactNode;
  onLoadChannels?: () => void; onChannel?: (value: string) => void; onSaveChannel?: () => void;
  onQuietChange?: (start: string, end: string) => void; onSaveQuiet?: (start: string, end: string) => void; onHours?: (value: string) => void; onSaveHours?: () => void;
}) {
  const id = useId();
  return <div className="flex flex-col gap-4">
    {installation.state === "active" && <section className="flex flex-col gap-3" aria-label="Operations channel">
      <Button variant="outline" disabled={busy || !configured} onClick={onLoadChannels}>Load private channels</Button>
      {channels && (channels.length ? <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); if (!busy && channel) onSaveChannel?.(); }}>
        <Label htmlFor={`${id}-channel`}>Operations channel</Label>
        <Select value={onChannel ? channel : undefined} defaultValue={onChannel ? undefined : channel} onValueChange={onChannel} disabled={busy} required>
          <SelectTrigger id={`${id}-channel`} className="w-full"><SelectValue placeholder="Choose a private channel" /></SelectTrigger>
          <SelectContent><SelectGroup>{channels.map(option => <SelectItem key={option.id} value={option.id}>#{option.name} · private</SelectItem>)}</SelectGroup></SelectContent>
        </Select><Button disabled={busy || !channel}>Save operations channel</Button>
      </form> : E.note("No eligible private channels. Add MGR to a private channel with sharing turned off, then load again."))}
      {E.note("Only active private channels with MGR added and sharing turned off are eligible. MGR checks again when you save and before delivery.")}
    </section>}
    <ChatQuietHoursView start={start} end={end} timezone={timezone} busy={busy} onChange={onQuietChange} onSave={onSaveQuiet} />
    <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); if (!busy) onSaveHours?.(); }}>
      <Label htmlFor={`${id}-hours`}>Reading overdue after (hours)</Label><Input id={`${id}-hours`} type="number" min={1} max={168} required value={onHours ? hours : undefined} defaultValue={onHours ? undefined : hours} onChange={event => onHours?.(event.target.value)} disabled={busy} />
      <p className="text-sm text-muted-foreground">Default: 24 hours. This changes when a reading becomes overdue in MGR Today and Slack.</p><Button disabled={busy}>Save reading cadence</Button>
    </form>
    {delivery !== undefined ? delivery : <ChatDeliveryView enabled={installation.state === "active"} />}
    <CommandFormMessage error={error} />
  </div>;
}

export function ChatDeliveryView({ enabled, canDisable = enabled, busy = false, error, onDisable }: { enabled: boolean; canDisable?: boolean; busy?: boolean; error?: string | null; onDisable?: () => void }) {
  const [localEnabled, setLocalEnabled] = useState(enabled);
  const active = onDisable ? enabled : localEnabled;
  const disable = () => { setLocalEnabled(false); onDisable?.(); };
  return <>
    {E.row("Delivery enabled", active ? "turn off all Slack sends" : "reauthorize Slack to enable delivery", <Switch aria-label="Slack delivery" checked={active} disabled={busy || !active} onCheckedChange={checked => { if (!checked) disable(); }} />, active ? "ok" : "w")}
    {canDisable && (onDisable || localEnabled) && <ChatDisableView busy={busy} onDisable={disable} />}
    <CommandFormMessage error={error} />
  </>;
}

export function ChatConnectionView({ configured = true, reauthorize = false, busy = false, error, onConnect }: { configured?: boolean; reauthorize?: boolean; busy?: boolean; error?: string | null; onConnect?: () => void }) {
  return <div className="flex flex-col gap-3">
    {!configured && E.note("Slack connection setup is unavailable. Your administrator must finish the server setup. Fixture previews remain available.")}
    <Button disabled={!configured || busy} onClick={onConnect}>{busy ? "Opening Slack…" : reauthorize ? "Reauthorize Slack" : "Connect Slack"}</Button>
    <CommandFormMessage error={error} />
  </div>;
}

export function ChatDisableView({ busy = false, error, onDisable }: { busy?: boolean; error?: string | null; onDisable?: () => void }) {
  return <div className="flex flex-col gap-3"><Button variant="outline" disabled={busy} onClick={onDisable}>Disable integration</Button><CommandFormMessage error={error} /></div>;
}

export function ChatHealthView({ health, configured = true, connection, disable, backHref, disconnectHref }: { health: ChatHealth; configured?: boolean; connection?: ReactNode; disable?: ReactNode; backHref?: string; disconnectHref?: string }) {
  const installation = health.installation;
  return <>
    {E.back("Chat", "Health", undefined, backHref)}
    {installation?.state === "active" ? E.info("Slack delivery is enabled. Blocked channels do not receive team digests; eligible personal sends continue.") : E.note("Slack delivery is stopped. Your MGR work remains available.")}
    {E.row("Connection", installation?.state.replaceAll("_", " ") ?? "Not connected")}
    {E.row("Last successful message from Slack", health.lastCallback ?? "None yet", health.lastCallback ? E.status("Succeeded", "ok") : "")}
    {E.row("Last successful delivery", health.lastDelivery ?? "None yet", health.lastDelivery ? E.status("Succeeded", "ok") : "")}
    {Object.entries(health.queue).map(([state, count]) => <div key={state}>{E.row(state.replaceAll("_", " "), `${count} deliveries`, state === "queued" && installation?.state !== "active" ? E.status("Paused", "w") : "", count ? "w" : "")}</div>)}
    {installation?.lastError && E.note(`Last provider error: ${installation.lastError.replaceAll("_", " ")}`)}
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
    {cleanupPending && E.note("Slack delivery has stopped. Credential cleanup failed; retry cleanup to finish disconnecting.")}
    {connected ? <Button variant="destructive" disabled={busy} onClick={onDisconnect}>{cleanupPending ? "Retry credential cleanup" : "Disconnect Slack"}</Button> : E.info("Slack is not connected.")}
    <CommandFormMessage error={error} />
  </div>;
}

export function ChatLinkedPeopleView({ people, backHref, linkHref, busy = false, error, onUnlink }: { people: ChatLinkedPerson[]; backHref?: string; linkHref?: string; busy?: boolean; error?: string | null; onUnlink?: (id: string) => void }) {
  return <>
    {E.back("Chat", "Linked people", undefined, backHref)}
    {!people.length && E.info("No current staff have linked Slack yet.")}
    {people.map(person => <div key={person.id}>{E.row(person.name, `${person.role} · Slack ${person.slackIdentity} · linked ${person.linkedAt.slice(0, 10)}`, <Button variant="destructive" size="sm" disabled={busy} onClick={() => onUnlink?.(person.id)}>Unlink</Button>)}</div>)}
    <CommandFormMessage error={error} />
    {E.btn("Link your Slack", "g", linkHref)}
  </>;
}

export function ChatLinkConsentView({ intent, backHref, busy = false, error, onLink }: { intent?: ChatLinkIntent | null; backHref?: string; busy?: boolean; error?: string | null; onLink?: () => void }) {
  return <>
    {E.ttl("Link your Slack")}
    {intent ? <>
      {E.info(`Slack user ${intent.slackIdentity} in ${intent.workspace} will be linked to ${intent.mgrIdentity} in ${intent.brewery}.`)}
      {E.note("This enables personal reminders and App Home. It does not change your MGR permissions.")}
      <Button data-variant="irreversible" className="bg-irreversible text-irreversible-foreground hover:bg-irreversible/90" disabled={busy} onClick={onLink}>Link accounts</Button>
    </> : E.info("This link is missing, expired, already used, or belongs to another brewery. Select the right brewery, then open MGR’s App Home in Slack and choose Link MGR account for a fresh link.")}
    <CommandFormMessage error={error} />
    {E.btn("Back", "g", backHref)}
  </>;
}
