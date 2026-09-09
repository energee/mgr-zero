// Settings controls call the registry. The preview picker uses only fixtures.
"use client";

import { useState } from "react";
import type { ChatPreviewId } from "@/lib/chat/contracts";
import { CHAT_PREVIEW_FIXTURES } from "@/lib/chat/preview-fixtures";
import { ChatPreview, ChatPreviewPicker } from "@/lib/chat/preview-web";

export function ChatPreviewPanel({ initial = "app-home" }: { initial?: ChatPreviewId }) {
  const [selected, setSelected] = useState<ChatPreviewId>(initial);
  const fixture = CHAT_PREVIEW_FIXTURES.find(({ id }) => id === selected) ?? CHAT_PREVIEW_FIXTURES[0];
  return (
    <div className="flex flex-col gap-4">
      <ChatPreviewPicker selected={selected} onSelect={setSelected} />
      <ChatPreview fixture={fixture} />
    </div>
  );
}

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { E } from "@/components/mgr/e";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { ChatHealth, ChatLinkIntent, ChatPreferences, ChatLinkedPerson } from "@/lib/commands/chat";

export function ChatConnectionAction({ installationId, configured }: { installationId?: string; configured: boolean }) {
  const action = useCommandAction();
  return <div className="flex flex-col gap-3">
    {!configured && E.note("Slack connection setup is unavailable. Your administrator must finish the server setup. Fixture previews remain available.")}
    <Button disabled={!configured || action.busy} onClick={() => void action.run(installationId ? "begin_chat_reauthorization" : "begin_chat_installation",
      installationId ? { installationId } : {}, (data) => { location.assign((data as { authorizeUrl: string }).authorizeUrl); })}>
      {action.busy ? "Opening Slack…" : installationId ? "Reauthorize Slack" : "Connect Slack"}
    </Button>
    <CommandFormMessage error={action.error} />
  </div>;
}

export function ChatSettingsControls({ installation, readingDueHours, timezone, configured }: { installation: NonNullable<ChatHealth["installation"]>; readingDueHours: number; timezone: string; configured: boolean }) {
  const action = useCommandAction();
  const [channels, setChannels] = useState<{ id: string; name: string }[] | null>(null);
  const [channel, setChannel] = useState("");
  const [hours, setHours] = useState(String(readingDueHours));
  const [start, setStart] = useState(installation.quietStart?.slice(0, 5) ?? "");
  const [end, setEnd] = useState(installation.quietEnd?.slice(0, 5) ?? "");
  return <div className="flex flex-col gap-5">
    {installation.state === "active" && <section className="flex flex-col gap-3" aria-label="Operations channel">
      <Button variant="outline" disabled={action.busy || !configured} onClick={() => void action.run("list_chat_channels", { installationId: installation.id }, (data) => { setChannels(data as { id: string; name: string }[]); setChannel(""); })}>Load private channels</Button>
      {channels && (channels.length ? <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void action.run("set_notification_destination", { installationId: installation.id, externalDestinationId: channel }); }}>
        <Label htmlFor="chat-channel">Operations channel</Label>
        <select id="chat-channel" className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm" value={channel} onChange={(e) => setChannel(e.target.value)} required>
          <option value="">Choose a private channel</option>{channels.map((c) => <option key={c.id} value={c.id}>#{c.name} · private</option>)}
        </select><Button disabled={action.busy || !channel}>Save operations channel</Button>
      </form> : E.note("No eligible private channels. Add MGR to a private channel with sharing turned off, then load again."))}
      {E.note("Only active private channels with MGR added and sharing turned off are eligible. MGR checks again when you save and before delivery.")}
    </section>}
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void action.run("set_brewery_quiet_hours", { installationId: installation.id, start: start || null, end: end || null }); }}>
      <Label htmlFor="chat-quiet-start">Brewery quiet hours start · {timezone}</Label><Input id="chat-quiet-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
      <Label htmlFor="chat-quiet-end">Brewery quiet hours end</Label><Input id="chat-quiet-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
      <p className="text-sm text-muted-foreground">Clear both times to turn off brewery quiet hours.</p>
      <Button disabled={action.busy || Boolean(start) !== Boolean(end)}>Save brewery quiet hours</Button>
    </form>
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void action.run("set_brewery_operating_defaults", { readingDueHours: Number(hours) }); }}>
      <Label htmlFor="chat-reading-hours">Reading overdue after (hours)</Label><Input id="chat-reading-hours" type="number" min={1} max={168} required value={hours} onChange={(e) => setHours(e.target.value)} />
      <p className="text-sm text-muted-foreground">Default: 24 hours. This changes when a reading becomes overdue in MGR Today and Slack.</p><Button disabled={action.busy}>Save reading cadence</Button>
    </form>
    {(installation.state === "active" || installation.state === "needs_reauthorization") && <ChatDisable installationId={installation.id} />}
    <CommandFormMessage error={action.error} />
  </div>;
}

export function ChatPersonalPreferences({ preferences, canSetQuietHours = true }: { preferences: ChatPreferences; canSetQuietHours?: boolean }) {
  const action = useCommandAction();
  const [start, setStart] = useState(preferences.quietStart?.slice(0, 5) ?? "");
  const [end, setEnd] = useState(preferences.quietEnd?.slice(0, 5) ?? "");
  const [timezone, setTimezone] = useState(preferences.timezone);
  return <div className="flex flex-col gap-4">
    {preferences.link ? E.row(`Slack user ${preferences.link.external_user_id}`, "Linked to your MGR account", <Button variant="outline" disabled={action.busy} onClick={() => void action.run("unlink_chat_user", { linkId: preferences.link!.id })}>Unlink my Slack</Button>) : E.info("To link your Slack, open MGR’s App Home in Slack and choose Link MGR account. Return here using that fresh link.")}
    {E.note("These preferences change your personal reminders. MGR work, assignments and App Home stay the same.")}
    {preferences.preferences.map((p) => <label key={p.reason} className="flex items-center justify-between gap-3 border-b py-3 text-sm">
      {p.reason.replaceAll("_", " ")}<input type="checkbox" className="size-5" checked={p.enabled} disabled={action.busy} onChange={(e) => void action.run("set_notification_preference", { reason: p.reason, enabled: e.target.checked })} />
    </label>)}
    {Boolean(preferences.destinations?.length) && preferences.preferences.map(p => <label key={`destination-${p.reason}`} className="flex items-center justify-between gap-3 text-sm">
      {p.reason.replaceAll("_", " ")} destination
      <select aria-label={`${p.reason.replaceAll("_", " ")} destination`} value={p.personalDestinationId ?? ""} disabled={action.busy}
        onChange={e => void action.run("set_notification_destination", { reason: p.reason, personalDestinationId: e.target.value })}>
        <option value="" disabled>Default delivery</option>
        {preferences.destinations!.map(d => <option key={d.id} value={d.id}>{d.external_destination_id}</option>)}
      </select>
    </label>)}
    {canSetQuietHours && <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void action.run("set_personal_quiet_hours", { start: start || null, end: end || null, timezone }); }}>
      <Label htmlFor="personal-quiet-start">My quiet hours start</Label><Input id="personal-quiet-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
      <Label htmlFor="personal-quiet-end">My quiet hours end</Label><Input id="personal-quiet-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
      <Label htmlFor="personal-timezone">My timezone</Label><Input id="personal-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} required />
      <p className="text-sm text-muted-foreground">Clear both times to follow the brewery quiet hours.</p>
      <Button disabled={action.busy || Boolean(start) !== Boolean(end)}>Save my quiet hours</Button>
    </form>}<CommandFormMessage error={action.error} />
  </div>;
}

export function ChatLinkConsent({ proof, intent }: { proof: string; intent: ChatLinkIntent }) {
  const action = useCommandAction(), router = useRouter();
  return <div className="flex flex-col gap-4">
    {E.info(`Slack user ${intent.slackIdentity} in ${intent.workspace} will be linked to ${intent.mgrIdentity} in ${intent.brewery}.`)}
    {E.note("This enables personal reminders and App Home. It does not change your MGR permissions.")}
    <Button disabled={action.busy} onClick={() => void action.run("consume_chat_link_proof", { proof }, () => router.push("/settings/chat/preferences?linked=1"))}>Link accounts</Button>
    <CommandFormMessage error={action.error} />
  </div>;
}

export function ChatDisconnect({ installationId, cleanupPending = false }: { installationId: string; cleanupPending?: boolean }) {
  const action = useCommandAction(), router = useRouter();
  const [pending, setPending] = useState(cleanupPending);
  return <div className="flex flex-col gap-4">
    {E.note("Stops: App Home, personal reminders, team digests and Slack actions.")}
    {E.info("Stays: MGR work, assignments, notification preferences and history.")}
    {pending && E.note("Slack delivery has stopped. Credential cleanup failed; retry cleanup to finish disconnecting.")}
    <Button variant="destructive" disabled={action.busy} onClick={() => void action.run("disconnect_chat_installation", { installationId }, (data) => {
      if ((data as { credentialDeleted: boolean }).credentialDeleted) router.push("/settings/chat"); else setPending(true);
    })}>{pending ? "Retry credential cleanup" : "Disconnect Slack"}</Button>
    <CommandFormMessage error={action.error} />
  </div>;
}

export function ChatLinkedPeople({ people }: { people: ChatLinkedPerson[] }) {
  const action = useCommandAction();
  return <div className="flex flex-col gap-3">
    {people.length === 0 && E.info("No current staff have linked Slack yet.")}
    {people.map((person) => <div key={person.id}>{E.row(person.name, `${person.role} · Slack ${person.slackIdentity} · linked ${person.linkedAt.slice(0, 10)}`,
      <Button variant="outline" disabled={action.busy} onClick={() => void action.run("unlink_chat_user", { linkId: person.id })}>Unlink</Button>)}</div>)}
    <CommandFormMessage error={action.error} />
  </div>;
}

export function ChatDisable({ installationId }: { installationId: string }) {
  const action = useCommandAction();
  return <div className="flex flex-col gap-3"><Button variant="outline" disabled={action.busy} onClick={() => void action.run("disable_chat_installation", { installationId })}>Disable integration</Button><CommandFormMessage error={action.error} /></div>;
}
