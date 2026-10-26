// #1422: live proposal dismissal hides only that preview and never records it.
import type * as React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";
import { ComposerProposalView } from "@/components/mgr/views/composer";
import { ComposerConversationView } from "@/components/mgr/views/composer-conversation";

const state = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[], messages: [] as UIMessage[] }));
vi.mock("react", async original => ({
  ...await original<typeof React>(),
  useEffect: () => {},
  useMemo: (factory: () => unknown) => factory(),
  useRef: () => ({ current: undefined }),
  useSyncExternalStore: () => true,
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = typeof initial === "function" ? initial() : initial;
    return [state.values[index], (value: unknown) => { state.values[index] = typeof value === "function" ? value(state.values[index]) : value; }];
  },
}));
vi.mock("@ai-sdk/react", () => ({ useChat: () => ({ messages: state.messages, status: "ready" }) }));
vi.mock("@/lib/brewery-provider", () => ({ useCommandContext: () => ({ actorId: "actor", breweryId: "brewery" }) }));
vi.mock("@/lib/commands/client", () => ({ command: vi.fn() }));
import { command } from "@/lib/commands/client";
import ComposerConversation from "@/components/mgr/composer-conversation";

type ProposalElement = React.ReactElement<React.ComponentProps<typeof ComposerProposalView>>;
const firstToken = "11111111-1111-4111-8111-111111111111";
const secondToken = "22222222-2222-4222-8222-222222222222";
function proposalMessage(previewToken: string): UIMessage {
  return {
    id: previewToken, role: "assistant", parts: [
      { type: "text", text: "Review this movement." },
      { type: "tool-record_movement", toolCallId: previewToken, state: "output-available", input: {}, output: {
        status: "awaiting_confirmation",
        proposal: {
          name: "record_movement", previewToken,
          input: { skuId: firstToken, locationId: firstToken, binId: firstToken, qty: -1, type: "loss" },
          effects: [{ label: "Proposed loss", qty: "-1" }], warnings: [],
        },
      } },
    ],
  };
}
function render(open = true) {
  state.cursor = 0;
  const tree = ComposerConversation({ chatConfigured: true, open, onOpenChange: vi.fn(), focusRequest: 0, outboxCount: 0, onOutbox: vi.fn() });
  const children = tree.props.children as React.ReactNode[];
  return {
    proposal: children.find(child => typeof child === "object" && child !== null && "type" in child && child.type === ComposerProposalView) as ProposalElement | undefined,
    conversation: children.find(child => typeof child === "object" && child !== null && "type" in child && child.type === ComposerConversationView) as React.ReactElement<React.ComponentProps<typeof ComposerConversationView>>,
  };
}
beforeEach(() => {
  state.values = ["conversation"];
  state.messages = [proposalMessage(firstToken)];
  vi.clearAllMocks();
});

it("dismisses the current preview without a command and keeps it dismissed when chat reopens", () => {
  const proposal = render().proposal;
  expect(proposal).toBeDefined();
  expect(proposal?.props.onCommit).toBeTypeOf("function");
  expect(proposal?.props.onDismiss).toBeTypeOf("function");
  proposal?.props.onDismiss?.();
  expect(render().proposal).toBeUndefined();
  expect(render(false).proposal).toBeUndefined();
  expect(render().proposal).toBeUndefined();
  expect(render().conversation.props.messages).toEqual([{ id: firstToken, role: "assistant", content: "Review this movement." }]);
  expect(command).not.toHaveBeenCalled();
});

it("shows a later preview even when it proposes identical movement fields", () => {
  render().proposal?.props.onDismiss?.();
  expect(render().proposal).toBeUndefined();
  state.messages = [...state.messages, proposalMessage(secondToken)];
  const proposal = render().proposal;
  expect(proposal).toBeDefined();
  expect(proposal?.props.openHref).toContain(secondToken);
  expect(proposal?.props.onCommit).toBeTypeOf("function");
  expect(command).not.toHaveBeenCalled();
});
