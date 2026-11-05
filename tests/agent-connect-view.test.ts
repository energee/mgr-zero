// tests/agent-connect-view.test.ts — what a person is told before and after
// connecting an outside agent, derived from the OAuth details and their breweries.
import { describe, expect, it } from "vitest";
import { toAgentConsentModel, toConnectedAgents } from "@/lib/mgr/agent-connect-view";

const details = { client: { name: "Claude" }, redirect_uri: "https://claude.ai/api/mcp/auth_callback" };

describe("toAgentConsentModel", () => {
  it("names where the sign-in goes, because a client chooses its own name", () => {
    expect(toAgentConsentModel(details, []).destination).toBe("claude.ai");
  });

  it("splits the person's breweries by the Admin switch", () => {
    const model = toAgentConsentModel(details, [
      { name: "North", agentsEnabled: true }, { name: "South", agentsEnabled: false },
    ]);
    expect(model.reachable).toEqual(["North"]);
    expect(model.unreachable).toEqual(["South"]);
  });

  it("cannot be approved when no brewery allows agents", () => {
    expect(toAgentConsentModel(details, [{ name: "South", agentsEnabled: false }]).canApprove).toBe(false);
    expect(toAgentConsentModel(details, []).canApprove).toBe(false);
    expect(toAgentConsentModel(details, [{ name: "North", agentsEnabled: true }]).canApprove).toBe(true);
  });

  it("falls back to a plain label for a client with no name", () => {
    expect(toAgentConsentModel({ ...details, client: { name: "" } }, []).clientName).toBe("An unnamed agent");
  });

  it("shows a custom-scheme destination whole, because it has no host", () => {
    expect(toAgentConsentModel({ ...details, redirect_uri: "cursor://anysphere.cursor-mcp/oauth" }, []).destination).toBe("anysphere.cursor-mcp");
    expect(toAgentConsentModel({ ...details, redirect_uri: "myapp:/callback" }, []).destination).toBe("myapp:/callback");
  });
});

describe("toConnectedAgents", () => {
  it("lists agents by name with the day each was connected", () => {
    expect(toConnectedAgents([
      { client: { id: "b", name: "Zed", uri: "", logo_uri: "" }, scopes: [], granted_at: "2026-11-02T12:00:00Z" },
      { client: { id: "a", name: "Claude", uri: "", logo_uri: "" }, scopes: [], granted_at: "2026-11-01T12:00:00Z" },
    ], "UTC")).toEqual([
      { clientId: "a", name: "Claude", connectedOn: "Nov 1, 2026" },
      { clientId: "b", name: "Zed", connectedOn: "Nov 2, 2026" },
    ]);
  });
});
