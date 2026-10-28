// Shared settings controls bind only the existing authorized commands here.
"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { ChatHealth, ChatLinkIntent, ChatPreferences, ChatLinkedPerson } from "@/lib/commands/chat";
import type { ChatSettingSave } from "@/lib/mgr/chat-save-feedback";
import { ChatConnectionView, ChatDisableView, ChatDisconnectView, ChatLinkedPeopleView, ChatLinkConsentView, ChatSettingsFieldsView, ChatDeliveryView, ChatPersonalPreferencesView } from "@/components/mgr/views/chat";

export function ChatConnectionAction({ installationId, configured }: { installationId?: string; configured: boolean }) {
  const action = useCommandAction();
  return <ChatConnectionView configured={configured} reauthorize={Boolean(installationId)} busy={action.busy} error={action.error} onConnect={() => void action.run(installationId ? "begin_chat_reauthorization" : "begin_chat_installation",
      installationId ? { installationId } : {}, data => { location.assign((data as { authorizeUrl: string }).authorizeUrl); })} />;
}

/** `channels` and `channel` are what the page read: the eligible private
 *  channels (null when they could not load) and the saved operations channel.
 *  Picking a channel saves it at once and puts the old one back if the save fails (#1509). */
export function ChatSettingsControls({ installation, timezone, configured, channels: loaded, channel: savedChannel }: { installation: NonNullable<ChatHealth["installation"]>; timezone: string; configured: boolean; channels: { id: string; name: string }[] | null; channel: string }) {
  const action = useCommandAction();
  const [channels, setChannels] = useState(loaded);
  const [channel, setChannel] = useState(savedChannel);
  const [start, setStart] = useState(installation.quietStart?.slice(0, 5) ?? "");
  const [end, setEnd] = useState(installation.quietEnd?.slice(0, 5) ?? "");
  const [saved, setSaved] = useState<ChatSettingSave | null>(null);
  return <ChatSettingsFieldsView installation={installation} timezone={timezone} start={start} end={end} channels={channels} channel={channel} configured={configured} busy={action.busy} saved={action.succeeded === saved?.name ? saved : null} error={action.error}
    onLoadChannels={() => void action.run("list_chat_channels", { installationId: installation.id }, data => setChannels(data as { id: string; name: string }[]), { durable: false })}
    onChannel={next => {
      if (action.busy || next === channel) return;
      setChannel(next);
      void action.run("set_notification_destination", { installationId: installation.id, externalDestinationId: next }, () => setSaved({ name: "set_notification_destination", channel: next }))
        .then(ok => { if (!ok) setChannel(channel); });
    }}
    onQuietChange={(start, end) => { setStart(start); setEnd(end); }}
    onSaveQuiet={(start, end) => void action.run("set_brewery_quiet_hours", { installationId: installation.id, start: start || null, end: end || null }, () => setSaved({ name: "set_brewery_quiet_hours", start, end }))}
    delivery={null}
  />;
}

export function ChatPersonalPreferences({ preferences, canSetQuietHours = true, back, backHref }: { preferences: ChatPreferences; canSetQuietHours?: boolean; back: string; backHref: string }) {
  const action = useCommandAction();
  const [savedQuiet, setSavedQuiet] = useState<ChatSettingSave | null>(null);
  return <ChatPersonalPreferencesView preferences={preferences} canSetQuietHours={canSetQuietHours} back={back} backHref={backHref} busy={action.busy} saved={action.succeeded === "set_notification_preference" || action.succeeded === "set_notification_destination"} savedQuiet={action.succeeded === savedQuiet?.name ? savedQuiet : null} error={action.error}
    onUnlink={() => { if (preferences.link) void action.run("unlink_chat_user", { linkId: preferences.link.id }, undefined, { target: preferences.link.id }); }}
    onPreference={(reason, enabled) => void action.run("set_notification_preference", { reason, enabled }, undefined, { target: reason })}
    onDestination={(reason, personalDestinationId) => void action.run("set_notification_destination", { reason, personalDestinationId }, undefined, { target: reason })}
    onSaveQuiet={(start, end, timezone) => void action.run("set_personal_quiet_hours", { start: start || null, end: end || null, timezone }, () => setSavedQuiet({ name: "set_personal_quiet_hours", start, end, timezone }))}
  />;
}

export function ChatLinkConsent({ proof, intent }: { proof: string; intent: ChatLinkIntent }) {
  const action = useCommandAction(), router = useRouter();
  return <ChatLinkConsentView intent={intent} backHref="/settings/chat/preferences" busy={action.busy} error={action.error} onLink={() => void action.run("consume_chat_link_proof", { proof }, () => router.push("/settings/chat/preferences?linked=1"), { durable: false })} />;
}

export function ChatDisconnect({ installationId, cleanupPending = false }: { installationId: string; cleanupPending?: boolean }) {
  const action = useCommandAction(), router = useRouter();
  const [pending, setPending] = useState(cleanupPending);
  return <ChatDisconnectView cleanupPending={pending} busy={action.busy} error={action.error} onDisconnect={() => void action.run("disconnect_chat_installation", { installationId }, (data) => {
      if ((data as { credentialDeleted: boolean }).credentialDeleted) router.push("/settings/chat"); else setPending(true);
    })} />;
}

export function ChatLinkedPeople({ people, timeZone }: { people: ChatLinkedPerson[]; timeZone: string }) {
  const action = useCommandAction();
  return <ChatLinkedPeopleView people={people} timeZone={timeZone} busy={action.busy} error={action.error} onUnlink={linkId => void action.run("unlink_chat_user", { linkId }, undefined, { target: linkId })} />;
}

export function ChatDisable({ installationId }: { installationId: string }) {
  const action = useCommandAction();
  return <ChatDisableView busy={action.busy} error={action.error} onDisable={() => void action.run("disable_chat_installation", { installationId })} />;
}

export function ChatDelivery({ installationId, enabled }: { installationId: string; enabled: boolean }) {
  const action = useCommandAction();
  return <ChatDeliveryView enabled={enabled} busy={action.busy} error={action.error} onDisable={() => void action.run("disable_chat_installation", { installationId })} />;
}
