// components/mgr/views/connected-agents.tsx — the agents a person has connected,
// each with a way to remove it. Opened from the Me sheet.
import { E } from "@/components/mgr/e";
import type { ConnectedAgent } from "@/lib/mgr/agent-connect-view";
import { navAbout } from "@/lib/mgr/nav";

export function ConnectedAgentsView({ agents, remove, error, backHref, proposalsHref }: {
  agents: ConnectedAgent[];
  remove?: (form: FormData) => Promise<void>;
  error?: string;
  backHref?: string;
  proposalsHref?: string;
}) {
  return <>
    {E.back("Today", "Agents", undefined, backHref)}
    {E.info("Agents connected to your account act as you. Removing one stops it at once.")}
    {error && E.note(error, "alert")}
    {E.nav("Changes to approve", navAbout("Changes to approve"), "", undefined, proposalsHref)}
    {agents.length ? agents.map(agent => <form key={agent.clientId} action={remove}>
      <input type="hidden" name="clientId" value={agent.clientId} />
      {E.row(agent.name, `Connected ${agent.connectedOn}`, E.btn("Remove", "del"))}
    </form>) : E.blank("No agents connected.")}
  </>;
}
