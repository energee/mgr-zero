// Shared settings controls bind only the existing authorized commands here.
"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { ChatHealth, ChatLinkIntent, ChatPreferences, ChatLinkedPerson } from "@/lib/commands/chat";
import { ChatConnectionView, ChatDisableView, ChatDisconnectView, ChatLinkedPeopleView, ChatLinkConsentView, ChatSettingsFieldsView, ChatDeliveryView, ChatPersonalPreferencesView } from "@/components/mgr/views/chat";

export function ChatConnectionAction({ installationId, configured }: { installationId?: string; configured: boolean }) {
  const action = useCommandAction();
  return <ChatConnectionView configured={configured} reauthorize={Boolean(installationId)} busy={action.busy} error={action.error} onConnect={() => void action.run(installationId ? "begin_chat_reauthorization" : "begin_chat_installation",
      installationId ? { installationId } : {}, data => { location.assign((data as { authorizeUrl: string }).authorizeUrl); })} />;
}

export function ChatSettingsControls({ installation, readingDueHours, timezone, configured }: { installation: NonNullable<ChatHealth["installation"]>; readingDueHours: number; timezone: string; configured: boolean }) {
  const action = useCommandAction();
  const [channels, setChannels] = useState<{ id: string; name: string }[] | null>(null);
  const [channel, setChannel] = useState("");
  const [hours, setHours] = useState(String(readingDueHours));
  const [start, setStart] = useState(installation.quietStart?.slice(0, 5) ?? "");
  const [end, setEnd] = useState(installation.quietEnd?.slice(0, 5) ?? "");
  return <ChatSettingsFieldsView installation={installation} timezone={timezone} hours={hours} start={start} end={end} channels={channels} channel={channel} configured={configured} busy={action.busy} error={action.error}
    onLoadChannels={() => void action.run("list_chat_channels", { installationId: installation.id }, data => { setChannels(data as { id: string; name: string }[]); setChannel(""); })}
    onChannel={setChannel} onSaveChannel={() => void action.run("set_notification_destination", { installationId: installation.id, externalDestinationId: channel })}
    onQuietChange={(start, end) => { setStart(start); setEnd(end); }}
    onSaveQuiet={(start, end) => void action.run("set_brewery_quiet_hours", { installationId: installation.id, start: start || null, end: end || null })}
    onHours={setHours} onSaveHours={() => void action.run("set_brewery_operating_defaults", { readingDueHours: Number(hours) })}
    delivery={null}
  />;
}

export function ChatPersonalPreferences({ preferences, canSetQuietHours = true, back, backHref }: { preferences: ChatPreferences; canSetQuietHours?: boolean; back: string; backHref: string }) {
  const action = useCommandAction();
  return <ChatPersonalPreferencesView preferences={preferences} canSetQuietHours={canSetQuietHours} back={back} backHref={backHref} busy={action.busy} error={action.error}
    onUnlink={() => { if (preferences.link) void action.run("unlink_chat_user", { linkId: preferences.link.id }); }}
    onPreference={(reason, enabled) => void action.run("set_notification_preference", { reason, enabled })}
    onDestination={(reason, personalDestinationId) => void action.run("set_notification_destination", { reason, personalDestinationId })}
    onSaveQuiet={(start, end, timezone) => void action.run("set_personal_quiet_hours", { start: start || null, end: end || null, timezone })}
  />;
}

export function ChatLinkConsent({ proof, intent }: { proof: string; intent: ChatLinkIntent }) {
  const action = useCommandAction(), router = useRouter();
  return <ChatLinkConsentView intent={intent} backHref="/settings/chat/preferences" busy={action.busy} error={action.error} onLink={() => void action.run("consume_chat_link_proof", { proof }, () => router.push("/settings/chat/preferences?linked=1"))} />;
}

export function ChatDisconnect({ installationId, cleanupPending = false }: { installationId: string; cleanupPending?: boolean }) {
  const action = useCommandAction(), router = useRouter();
  const [pending, setPending] = useState(cleanupPending);
  return <ChatDisconnectView cleanupPending={pending} busy={action.busy} error={action.error} onDisconnect={() => void action.run("disconnect_chat_installation", { installationId }, (data) => {
      if ((data as { credentialDeleted: boolean }).credentialDeleted) router.push("/settings/chat"); else setPending(true);
    })} />;
}

export function ChatLinkedPeople({ people }: { people: ChatLinkedPerson[] }) {
  const action = useCommandAction();
  return <ChatLinkedPeopleView people={people} backHref="/settings/chat" linkHref="/settings/chat/link" busy={action.busy} error={action.error} onUnlink={linkId => void action.run("unlink_chat_user", { linkId })} />;
}

export function ChatDisable({ installationId }: { installationId: string }) {
  const action = useCommandAction();
  return <ChatDisableView busy={action.busy} error={action.error} onDisable={() => void action.run("disable_chat_installation", { installationId })} />;
}

export function ChatDelivery({ installationId, enabled }: { installationId: string; enabled: boolean }) {
  const action = useCommandAction();
  return <ChatDeliveryView enabled={enabled} canDisable busy={action.busy} error={action.error} onDisable={() => void action.run("disable_chat_installation", { installationId })} />;
}
