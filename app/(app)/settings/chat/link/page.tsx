// app/(app)/settings/chat/link/page.tsx — completes a Slack → MGR account link.
// Reached from App Home with ?proof=…; the authenticated shell supplies the
// MGR identity, and consume_chat_link_proof binds it to the pending link only
// if this person is current staff of the installation's brewery.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { CommandError, runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

export default async function ChatLinkPage({ searchParams }: { searchParams: Promise<{ proof?: string }> }) {
  const { proof } = await searchParams;
  let message = "This link is missing its proof. Open Link MGR account from Slack again.";
  let linked = false;
  if (proof) {
    try {
      const brewery = await getActiveBrewery();
      const ctx = await buildContext(brewery.id);
      await runCommand("consume_chat_link_proof", { proof }, ctx);
      linked = true;
      message = "Your Slack account is linked. Your private App Home now shows only work your current role permits.";
    } catch (e) {
      message = e instanceof CommandError
        ? `Could not link: ${e.message}. Open Link MGR account from Slack to get a fresh link.`
        : "Could not link right now. Try again from Slack.";
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{linked ? "Linked to Slack" : "Link Slack"}</h1>
      <p className="text-sm">{message}</p>
      <p className="text-xs text-muted-foreground">No customer contacts, prices or notes are ever posted to Slack.</p>
    </div>
  );
}
