import type { StaffRole } from "@/lib/commands/registry";
import { canRetireCommandFailure } from "@/lib/commands/failure";

export type ComposerRole = StaffRole | "customer";
export type MovementKind = "opening_balance" | "production_in" | "adjustment" | "depletion"
  | "return_in" | "destruction" | "loss" | "sample" | "festival_removal";
export type MovementDraft = {
  skuId?: string;
  kind?: MovementKind;
  direction?: "add" | "remove";
  locationId?: string;
  binId?: string;
  lotChoice?: "untracked" | string;
  qty?: string;
  saleChannelId?: string;
  destState?: string;
  note?: string;
};
export type MovementInput = {
  skuId: string;
  locationId: string;
  binId: string;
  qty: number;
  type: MovementKind;
  lotId?: string;
  saleChannelId?: string;
  destState?: string;
  note?: string;
};
export type ComposerEffect = {
  label: string;
  qty?: string;
  bbl?: string;
  stockBeforeQty?: string;
  stockAfterQty?: string;
  taxTreatment?: string | null;
  correction?: string | null;
};
export type ComposerProposal = {
  name: "record_movement";
  input: MovementInput;
  previewToken: string;
  effects: ComposerEffect[];
  warnings: string[];
};
export type ComposerHistoryMessage = {
  id: string;
  role: "user" | "assistant" | "result";
  content: string | null;
  result?: unknown;
  created_at: string;
};
export type ComposerState = {
  scopeKey: string;
  draft: MovementDraft;
  proposal: ComposerProposal | null;
  conversationId: string | null;
  commitRequestId: string | null;
  committing: boolean;
  commitHadUncertainOutcome: boolean;
  historyOpen: boolean;
  history: ComposerHistoryMessage[];
};
export type ComposerAction = {
  id: "record_movement" | "read_atp";
  label: string;
  queries: string[];
  href?: string;
};

export function composerInitialState(scopeKey: string): ComposerState {
  return { scopeKey, draft: {}, proposal: null, conversationId: null, commitRequestId: null, committing: false, commitHadUncertainOutcome: false, historyOpen: false, history: [] };
}

export function movementQuestion(draft: MovementDraft) {
  if (!draft.skuId) return { field: "skuId", prompt: "Which SKU / package?" } as const;
  if (!draft.kind) return { field: "kind", prompt: "Are you counting stock, adding it, or recording a removal?" } as const;
  if (draft.kind === "adjustment" && !draft.direction) return { field: "direction", prompt: "Does this adjustment add or remove stock?" } as const;
  if (!draft.locationId) return { field: "locationId", prompt: "Which location?" } as const;
  if (!draft.binId) return { field: "binId", prompt: "Which bin?" } as const;
  if (!draft.lotChoice) return { field: "lotChoice", prompt: "Which tracked lot, or explicitly untracked stock?" } as const;
  const enteredQty = draft.qty?.trim() ?? "";
  const qty = Number(enteredQty);
  if (!/^(?:\d+|\d*\.\d{1,2})$/.test(enteredQty) || !Number.isFinite(qty) || qty <= 0) {
    return { field: "qty", prompt: "What positive quantity, up to two decimal places?" } as const;
  }
  if (draft.kind === "depletion" && !draft.saleChannelId) return { field: "saleChannelId", prompt: "Which sale channel?" } as const;
  if ((draft.kind === "sample" || draft.kind === "festival_removal") && !/^[A-Za-z]{2}$/.test(draft.destState ?? "")) {
    return { field: "destState", prompt: "Which two-letter destination state?" } as const;
  }
  return null;
}

export function toMovementInput(draft: MovementDraft): MovementInput | null {
  if (movementQuestion(draft)) return null;
  const kind = draft.kind!;
  const amount = Number(draft.qty);
  const positive = kind === "opening_balance" || kind === "production_in" || kind === "return_in"
    || (kind === "adjustment" && draft.direction === "add");
  return {
    skuId: draft.skuId!, locationId: draft.locationId!, binId: draft.binId!,
    qty: positive ? amount : -amount, type: kind,
    ...(draft.lotChoice !== "untracked" ? { lotId: draft.lotChoice } : {}),
    ...(kind === "depletion" ? { saleChannelId: draft.saleChannelId } : {}),
    ...(kind === "sample" || kind === "festival_removal" ? { destState: draft.destState!.toUpperCase() } : {}),
    ...(draft.note?.trim() ? { note: draft.note.trim() } : {}),
  };
}

export function retireMovementProposal(state: ComposerState): ComposerState {
  return movementIsLocked(state) ? state : completeComposerCommit(state);
}

export function movementIsLocked(state: ComposerState) {
  return state.committing || state.commitHadUncertainOutcome;
}

export function completeComposerCommit(state: ComposerState): ComposerState {
  return { ...state, proposal: null, commitRequestId: null, committing: false, commitHadUncertainOutcome: false };
}

export function failComposerCommit(state: ComposerState, status: number | null, code?: string): ComposerState {
  if (!state.committing) return state;
  return status !== null && canRetireCommandFailure(status, state.commitHadUncertainOutcome, code)
    ? completeComposerCommit(state)
    : { ...state, committing: false, commitHadUncertainOutcome: true };
}

export function createComposerRequestGuard() {
  let generation = 0;
  return {
    invalidate() { generation += 1; },
    async run<T>(request: () => Promise<T>): Promise<T | null> {
      const started = ++generation;
      try {
        const result = await request();
        return started === generation ? result : null;
      } catch (error) {
        if (started === generation) throw error;
        return null;
      }
    },
  };
}

export function editMovementDraft(state: ComposerState, patch: Partial<MovementDraft>): ComposerState {
  return movementIsLocked(state) ? state : { ...retireMovementProposal(state), draft: { ...state.draft, ...patch } };
}

export function receiveProposal(state: ComposerState, proposal: ComposerProposal, conversationId: string, requestId: string): ComposerState {
  return { ...state, proposal, conversationId, commitRequestId: requestId, committing: false, commitHadUncertainOutcome: false };
}

export function beginComposerCommit(state: ComposerState) {
  if (!state.proposal || !state.conversationId || !state.commitRequestId || state.committing) return { state, envelope: null };
  return {
    state: { ...state, committing: true },
    envelope: {
      name: state.proposal.name, input: state.proposal.input, requestId: state.commitRequestId,
      conversationId: state.conversationId, previewToken: state.proposal.previewToken,
      retrying: state.commitHadUncertainOutcome,
    },
  };
}

export function movementFormHref(input: MovementInput, handoffId?: string) {
  const query = new URLSearchParams({
    recordMovement: "1", skuId: input.skuId, locationId: input.locationId,
    binId: input.binId, qty: String(input.qty), type: input.type,
  });
  if (input.lotId) query.set("lotId", input.lotId);
  if (input.saleChannelId) query.set("saleChannelId", input.saleChannelId);
  if (input.destState) query.set("destState", input.destState);
  if (input.note) query.set("note", input.note);
  if (handoffId) query.set("movementHandoff", handoffId);
  return `/inventory?${query}`;
}

export function movementFormInstanceKey(handoffId?: string) {
  return handoffId ? `composer:${handoffId}` : "manual";
}

export function composerActions(role: ComposerRole): ComposerAction[] {
  if (role === "customer") return [];
  const reads: ComposerAction[] = [{ id: "read_atp", label: "Check available to promise", queries: ["list_skus", "get_atp"] }];
  if (role === "admin" || role === "warehouse") reads.unshift({
    id: "record_movement", label: "Record inventory movement",
    queries: ["list_skus", "list_locations", "list_bins", "list_sale_channels", "get_bin_move_stock", "preview_command"],
    href: "/inventory?recordMovement=1",
  });
  return role === "sales" || role === "admin" || role === "warehouse" ? reads : [];
}

export function resetComposerScope(state: ComposerState, scopeKey: string) {
  return state.scopeKey === scopeKey ? state : composerInitialState(scopeKey);
}
