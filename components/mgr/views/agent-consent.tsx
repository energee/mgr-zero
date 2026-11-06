// components/mgr/views/agent-consent.tsx — the page a person sees when an outside
// agent asks to connect. A null model means the request expired or was never valid.
import { E } from "@/components/mgr/e";
import type { AgentConsentModel } from "@/lib/mgr/agent-connect-view";

export function AgentConsentView({ model, authorizationId, approve, deny }: {
  model: AgentConsentModel | null;
  authorizationId?: string;
  approve?: (form: FormData) => Promise<void>;
  deny?: (form: FormData) => Promise<void>;
}) {
  const request = <input type="hidden" name="authorizationId" value={authorizationId} />;
  return <>
    {E.hd(model ? `Connect ${model.clientName}?` : "Connect an agent")}
    {model ? <>
      {E.row(model.clientName, `Sends you back to ${model.destination}`)}
      {E.info("It acts as you. It can read what your role can read, and it can propose changes. Nothing changes until you approve it.")}
      {E.info("The company behind this agent receives what it reads, under its own terms.")}
      {model.canApprove
        ? E.row("Breweries it can reach", model.reachable.join(", "))
        : E.note("None of your breweries allow agents. Ask an Admin to turn them on in Settings.", "alert")}
      {model.unreachable.length > 0 && E.row("Agents are off at", model.unreachable.join(", "))}
      {model.canApprove && <form action={approve}>{request}{E.btn("Connect")}</form>}
      <form action={deny}>{request}{E.btn("Deny", "g")}</form>
    </> : E.note("This request has expired. Go back to your agent and connect again.", "alert")}
  </>;
}
