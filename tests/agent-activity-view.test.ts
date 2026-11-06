// tests/agent-activity-view.test.ts — how the Admin reads the session log.
import { describe, expect, it } from "vitest";
import { toAgentSessionRows, toAgentSessionViewProps } from "@/lib/mgr/agent-activity-view";

const session = { id: "s1", clientId: "c1", clientName: "Claude", person: "ana@example.test", lastSeenAt: "2026-11-05T15:00:00Z", steps: 3, problems: 1, notes: 0 };

describe("agent activity view", () => {
  it("names each session's agent and person, and counts problems", () => {
    expect(toAgentSessionRows([session], "UTC")).toEqual([
      { id: "s1", title: "Claude", detail: "ana@example.test · 3 steps · 1 problem · Nov 5, 2026", href: "/settings/agents/activity/s1" },
    ]);
  });

  it("calls a null client Ask MGR, and a client with no name a removed agent", () => {
    const names = toAgentSessionRows([{ ...session, clientId: null, clientName: null }, { ...session, clientName: null }], "UTC").map(row => row.title);
    expect(names).toEqual(["Ask MGR", "A removed agent"]);
  });

  it("leaves out the problem count when nothing went wrong", () => {
    expect(toAgentSessionRows([{ ...session, steps: 1, problems: 0 }], "UTC")[0].detail).toBe("ana@example.test · 1 step · Nov 5, 2026");
  });

  it("describes each step by what it reached and how it ended", () => {
    const { steps } = toAgentSessionViewProps({ ...session, stepRows: [
      { tool: "run_query", operation: "get_today", outcome: "ok", error_code: null, input_path: null },
      { tool: "find_operations", operation: null, outcome: "ok", error_code: null, input_path: null },
      { tool: "run_query", operation: "get_on_hand", outcome: "refused", error_code: "invalid_input", input_path: "skuId" },
      { tool: "run_query", operation: "get_today", outcome: "failed", error_code: null, input_path: null },
    ], noteRows: [] }, "UTC");
    expect(steps).toEqual([
      { title: "get_today", detail: "Done" },
      { title: "find_operations", detail: "Done" },
      { title: "get_on_hand", detail: "Refused: invalid_input at skuId" },
      { title: "get_today", detail: "Failed" },
    ]);
  });

  it("always labels a note with the agent that wrote it", () => {
    const { notes } = toAgentSessionViewProps({ ...session, stepRows: [], noteRows: [{ id: "n1", kind: "friction", body: "The bin list needs a location." }] }, "UTC");
    expect(notes).toEqual([{ id: "n1", title: "Friction note from Claude", text: "The bin list needs a location." }]);
  });
});
