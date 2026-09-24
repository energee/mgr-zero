import { describe, expect, it } from "vitest";
import { buildModelMessages, MAX_HISTORY_MESSAGES, type StoredChatMessage } from "@/lib/chat/model-messages";

const newId = "00000000-0000-4000-8000-0000000000aa";

function turn(i: number): StoredChatMessage[] {
  return [
    { role: "user", content: `q${i}`, request_id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` },
    { role: "assistant", content: `a${i}`, request_id: null },
  ];
}

describe("Ask MGR model messages (#460)", () => {
  it("appends the new user message after stored history, skipping results and empty content", () => {
    const history: StoredChatMessage[] = [...turn(1), { role: "result", content: null, request_id: null }, { role: "assistant", content: null, request_id: null }];
    expect(buildModelMessages(history, { id: newId, text: "q2" })).toEqual([
      { role: "user", content: "q1" }, { role: "assistant", content: "a1" }, { role: "user", content: "q2" },
    ]);
  });

  it("does not send the user message twice on Try again (same message id already stored)", () => {
    const history: StoredChatMessage[] = [...turn(1), { role: "user", content: "q2", request_id: newId }, { role: "assistant", content: "old answer", request_id: null }];
    expect(buildModelMessages(history, { id: newId, text: "q2" })).toEqual([
      { role: "user", content: "q1" }, { role: "assistant", content: "a1" }, { role: "user", content: "q2" },
    ]);
  });

  it("caps history to the most recent MAX_HISTORY_MESSAGES plus the new message", () => {
    const history = Array.from({ length: 100 }, (_, i) => turn(i)).flat();
    const messages = buildModelMessages(history, { id: newId, text: "latest" });
    expect(messages).toHaveLength(MAX_HISTORY_MESSAGES + 1);
    expect(messages.at(-2)).toEqual({ role: "assistant", content: "a99" });
    expect(messages.at(-1)).toEqual({ role: "user", content: "latest" });
  });
});
