"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import type { ChatHealth, ChatLinkIntent, ChatLinkedPerson } from "@/lib/commands/chat";

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
