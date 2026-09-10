"use client";

import { useEffect, useRef, useState } from "react";
import { useCommandContext } from "@/app/(app)/brewery-provider";
import {
  ComposerAnswerView,
  ComposerHistoryView,
  ComposerProposalView,
  ComposerQuestionView,
  ComposerStripView,
} from "@/components/mgr/views/composer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CommandResponseError, command } from "@/lib/commands/client";
import {
  beginComposerCommit,
  composerActions,
  composerInitialState,
  editMovementDraft,
  movementFormHref,
  movementQuestion,
  receiveProposal,
  toMovementInput,
  type ComposerAction,
  type ComposerHistoryMessage,
  type ComposerProposal,
  type ComposerRole,
  type MovementDraft,
  type MovementKind,
} from "@/lib/composer/state";

type Sku = { id: string; name: string; active: boolean; brands: { name: string } | null; formats: { name: string } | null };
type Location = { id: string; name: string; kind: string };
type Bin = { id: string; location_id: string; name: string };
type Channel = { id: string; name: string };
type Stock = { bin_id: string; kind: string; stock_id: string; lot_id: string | null; lot_code: string | null; qty: number };
type PortalSku = { skuId: string; name: string; product: string; badge: string; unitPriceCents: number };
type Conversation = { id: string; title: string; updated_at: string };
type Answer = { query: string; answer: string; detail?: string; observedAt: string };

const MOVEMENT_TYPES: { value: MovementKind; label: string }[] = [
  { value: "opening_balance", label: "Opening balance" },
  { value: "production_in", label: "Production in" },
  { value: "adjustment", label: "Adjustment" },
  { value: "depletion", label: "Depletion" },
  { value: "return_in", label: "Return in" },
  { value: "destruction", label: "Destruction" },
  { value: "loss", label: "Loss" },
  { value: "sample", label: "Sample" },
  { value: "festival_removal", label: "Festival removal" },
];

function skuLabel(sku: Sku) {
  return [sku.brands?.name, sku.name, sku.formats?.name].filter(Boolean).join(" · ");
}

function messageText(error: unknown) {
  return error instanceof Error ? error.message : "Composer unavailable";
}

export function Composer({ role, portal = false }: { role: ComposerRole; portal?: boolean }) {
  const expectedContext = useCommandContext();
  const breweryId = expectedContext.breweryId ?? "";
  const scopeKey = `${expectedContext.actorId}:${breweryId}:${expectedContext.customerId ?? "staff"}:${role}`;
  const [state, setState] = useState(() => composerInitialState(scopeKey));
  const [action, setAction] = useState<ComposerAction | null>(null);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [bins, setBins] = useState<Bin[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [portalSkus, setPortalSkus] = useState<PortalSku[]>([]);
  const [readSkuId, setReadSkuId] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationRef = useRef<string | null>(null);
  const actionRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    const focusComposer = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        actionRef.current?.focus();
      }
    };
    addEventListener("keydown", focusComposer);
    return () => removeEventListener("keydown", focusComposer);
  }, []);

  const actions = composerActions(role);
  const run = (name: string, input: unknown, requestId?: string, provenance?: Parameters<typeof command>[5]) =>
    command(breweryId, name, input, requestId, expectedContext, provenance);

  async function ensureConversation(title: string) {
    if (conversationRef.current) return conversationRef.current;
    const conversation = await run("create_chat_conversation", { title }, crypto.randomUUID()) as { id: string };
    conversationRef.current = conversation.id;
    setState((current) => ({ ...current, conversationId: conversation.id }));
    return conversation.id;
  }

  async function append(conversationId: string, messageRole: "user" | "assistant", content: string) {
    await run("append_chat_message", { conversationId, role: messageRole, content }, crypto.randomUUID());
  }

  async function chooseAction(id: string) {
    const selected = actions.find((candidate) => candidate.id === id) ?? null;
    setAction(selected);
    setAnswer(null);
    setError(null);
    if (!selected) return;
    setBusy(true);
    try {
      if (selected.id === "record_movement") {
        const [skuRows, locationRows, binRows, channelRows] = await Promise.all([
          run("list_skus", {}), run("list_locations", {}), run("list_bins", {}), run("list_sale_channels", {}),
        ]);
        setSkus(skuRows as Sku[]);
        setLocations(locationRows as Location[]);
        setBins(binRows as Bin[]);
        setChannels(channelRows as Channel[]);
      } else if (selected.id === "read_atp") {
        setSkus(await run("list_skus", {}) as Sku[]);
      } else {
        setPortalSkus(await run("portal_catalog", {}) as PortalSku[]);
      }
    } catch (cause) {
      setError(messageText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function changeDraft(patch: Partial<MovementDraft>) {
    setState((current) => editMovementDraft(current, patch));
    setError(null);
    if (patch.locationId) {
      try { setStock(await run("get_bin_move_stock", { locationId: patch.locationId }) as Stock[]); }
      catch (cause) { setError(messageText(cause)); }
    }
  }

  async function previewMovement() {
    const input = toMovementInput(state.draft);
    if (!input) return;
    setBusy(true);
    setError(null);
    try {
      const conversationId = await ensureConversation("Inventory movement");
      const result = await run("preview_command", { name: "record_movement", input, conversationId }) as {
        valid: boolean; allowed: boolean; preview: Omit<ComposerProposal, "name" | "input"> | null;
      };
      if (!result.valid || !result.allowed || !result.preview) throw new Error("This movement cannot be previewed for your current role and fields.");
      await append(conversationId, "user", `Preview ${input.qty} unit(s) of ${skus.find((sku) => sku.id === input.skuId)?.name ?? "the selected SKU"}.`);
      await append(conversationId, "assistant", "Canonical movement proposal ready for review.");
      setState((current) => receiveProposal(current, { name: "record_movement", input, ...result.preview! }, conversationId, crypto.randomUUID()));
    } catch (cause) {
      setError(messageText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function commitMovement() {
    const started = beginComposerCommit(state);
    if (!started.envelope) return;
    setState(started.state);
    setError(null);
    try {
      const envelope = started.envelope;
      const receipt = await run(envelope.name, envelope.input, envelope.requestId, {
        origin: "chat", conversationId: envelope.conversationId, previewToken: envelope.previewToken,
      }) as { id?: string };
      setAnswer({ query: "Record inventory movement", answer: "Movement recorded", detail: receipt.id ? `Reference ${receipt.id}` : undefined, observedAt: new Date().toLocaleString() });
      setState((current) => ({ ...current, proposal: null, commitRequestId: null, committing: false }));
    } catch (cause) {
      if (cause instanceof CommandResponseError && cause.status === 409) {
        setState((current) => ({ ...current, proposal: null, commitRequestId: null, committing: false }));
        setError("The proposal changed or expired. Preview the current data again.");
      } else {
        setState((current) => ({ ...current, committing: false }));
        setError(messageText(cause));
      }
    }
  }

  async function readAnswer() {
    if (!readSkuId) return;
    setBusy(true);
    setError(null);
    try {
      const conversationId = await ensureConversation(portal ? "Account availability" : "Available to promise");
      let next: Answer;
      if (portal) {
        const rows = await run("portal_catalog", {}) as PortalSku[];
        setPortalSkus(rows);
        const sku = rows.find((row) => row.skuId === readSkuId);
        if (!sku) throw new Error("Choose an account SKU.");
        next = { query: `Is ${sku.product} · ${sku.name} available?`, answer: sku.badge, detail: `Current account price $${(sku.unitPriceCents / 100).toFixed(2)}`, observedAt: new Date().toLocaleString() };
      } else {
        const rows = await run("get_atp", { skuId: readSkuId }) as { qty: number | string }[];
        const sku = skus.find((row) => row.id === readSkuId);
        const qty = rows.reduce((total, row) => total + Number(row.qty), 0);
        next = { query: `How much ${sku ? skuLabel(sku) : "of this SKU"} is available to promise?`, answer: `${qty} SKU units`, detail: "Current ATP across this brewery", observedAt: new Date().toLocaleString() };
      }
      await append(conversationId, "user", next.query);
      await append(conversationId, "assistant", `${next.answer}${next.detail ? ` · ${next.detail}` : ""} · observed ${next.observedAt}`);
      setAnswer(next);
    } catch (cause) {
      setError(messageText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory(conversationId?: string) {
    setError(null);
    try {
      const list = await run("list_chat_conversations", {}) as Conversation[];
      setConversations(list);
      const selected = conversationId ?? conversationRef.current ?? list[0]?.id;
      if (!selected) {
        setState((current) => ({ ...current, historyOpen: true, history: [] }));
        return;
      }
      const data = await run("get_chat_history", { conversationId: selected }) as { messages: ComposerHistoryMessage[] };
      setState((current) => ({ ...current, historyOpen: true, history: data.messages }));
    } catch (cause) {
      setError(messageText(cause));
    }
  }

  const question = action?.id === "record_movement" ? movementQuestion(state.draft) : null;
  const lotOptions = stock.filter((row) => row.kind === "sku" && row.stock_id === state.draft.skuId && row.bin_id === state.draft.binId && row.lot_id);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
      {state.historyOpen && <>
        {conversations.length > 0 && <Label className="flex items-center gap-2 text-xs">Conversation
          <select className="rounded-md border bg-background p-1" onChange={(event) => void loadHistory(event.target.value)}>
            {conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}
          </select>
        </Label>}
        <ComposerHistoryView messages={state.history} onClose={() => setState((current) => ({ ...current, historyOpen: false }))} />
      </>}

      {action?.id === "record_movement" && <section className="grid gap-2 rounded-md border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Label>SKU / package<select className="mt-1 w-full rounded-md border bg-background p-2" value={state.draft.skuId ?? ""} onChange={(event) => void changeDraft({ skuId: event.target.value || undefined, lotChoice: undefined })}><option value="">Choose…</option>{skus.map((sku) => <option key={sku.id} value={sku.id}>{skuLabel(sku)}</option>)}</select></Label>
        <Label>Type<select className="mt-1 w-full rounded-md border bg-background p-2" value={state.draft.kind ?? ""} onChange={(event) => void changeDraft({ kind: (event.target.value || undefined) as MovementKind | undefined, direction: undefined, saleChannelId: undefined, destState: undefined })}><option value="">Choose…</option>{MOVEMENT_TYPES.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></Label>
        {state.draft.kind === "adjustment" && <Label>Direction<select className="mt-1 w-full rounded-md border bg-background p-2" value={state.draft.direction ?? ""} onChange={(event) => void changeDraft({ direction: (event.target.value || undefined) as "add" | "remove" | undefined })}><option value="">Choose…</option><option value="add">Add stock</option><option value="remove">Remove stock</option></select></Label>}
        <Label>Location<select className="mt-1 w-full rounded-md border bg-background p-2" value={state.draft.locationId ?? ""} onChange={(event) => void changeDraft({ locationId: event.target.value || undefined, binId: undefined, lotChoice: undefined })}><option value="">Choose…</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Label>
        <Label>Bin<select className="mt-1 w-full rounded-md border bg-background p-2" value={state.draft.binId ?? ""} disabled={!state.draft.locationId} onChange={(event) => void changeDraft({ binId: event.target.value || undefined, lotChoice: undefined })}><option value="">Choose…</option>{bins.filter((bin) => bin.location_id === state.draft.locationId).map((bin) => <option key={bin.id} value={bin.id}>{bin.name}</option>)}</select></Label>
        <Label>Lot<select className="mt-1 w-full rounded-md border bg-background p-2" value={state.draft.lotChoice ?? ""} disabled={!state.draft.binId || !state.draft.skuId} onChange={(event) => void changeDraft({ lotChoice: event.target.value || undefined })}><option value="">Choose…</option><option value="untracked">Untracked / legacy stock</option>{lotOptions.map((row) => <option key={row.lot_id!} value={row.lot_id!}>{row.lot_code} · {row.qty} available</option>)}</select></Label>
        <Label>Positive quantity<Input className="mt-1" type="number" min="0.01" step="0.01" value={state.draft.qty ?? ""} onChange={(event) => void changeDraft({ qty: event.target.value })} /></Label>
        {state.draft.kind === "depletion" && <Label>Sale channel<select className="mt-1 w-full rounded-md border bg-background p-2" value={state.draft.saleChannelId ?? ""} onChange={(event) => void changeDraft({ saleChannelId: event.target.value || undefined })}><option value="">Choose…</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></Label>}
        {(state.draft.kind === "sample" || state.draft.kind === "festival_removal") && <Label>Destination state<Input className="mt-1" maxLength={2} pattern="[A-Za-z]{2}" value={state.draft.destState ?? ""} onChange={(event) => void changeDraft({ destState: event.target.value.toUpperCase() })} /></Label>}
        <Label className="sm:col-span-2">Note<Input className="mt-1" value={state.draft.note ?? ""} onChange={(event) => void changeDraft({ note: event.target.value })} /></Label>
        <div className="flex items-end"><Button type="button" disabled={busy || Boolean(question)} onClick={() => void previewMovement()}>{busy ? "Loading…" : state.proposal ? "Preview current data" : "Preview movement"}</Button></div>
      </section>}

      {question && <ComposerQuestionView prompt={question.prompt} />}
      {state.proposal && <ComposerProposalView effects={state.proposal.effects} warnings={state.proposal.warnings} openHref={movementFormHref(state.proposal.input)} onDismiss={() => setState((current) => ({ ...current, proposal: null, commitRequestId: null }))} onCommit={() => void commitMovement()} committing={state.committing} />}

      {(action?.id === "read_atp" || action?.id === "portal_availability") && <section className="flex flex-col gap-2 rounded-md border bg-card p-3 sm:flex-row sm:items-end">
        <Label className="flex-1">SKU / package<select className="mt-1 w-full rounded-md border bg-background p-2" value={readSkuId} onChange={(event) => { setReadSkuId(event.target.value); setAnswer(null); }}><option value="">Choose…</option>{(portal ? portalSkus : skus).map((sku) => {
          const id = "skuId" in sku ? sku.skuId : sku.id;
          const label = "skuId" in sku ? `${sku.product} · ${sku.name}` : skuLabel(sku);
          return <option key={id} value={id}>{label}</option>;
        })}</select></Label>
        <Button type="button" disabled={!readSkuId || busy} onClick={() => void readAnswer()}>{busy ? "Refreshing…" : "Read current answer"}</Button>
      </section>}
      {answer && <ComposerAnswerView {...answer} />}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {action && <Button type="button" variant="ghost" className="self-start" onClick={() => { setAction(null); setAnswer(null); setError(null); }}>Close composer</Button>}
      <ComposerStripView portal={portal} actions={actions.map((item) => ({ value: item.id, label: item.label }))} onAction={(id) => void chooseAction(id)} onHistory={() => void loadHistory()} actionRef={actionRef} />
      <p className="text-center text-[11px] text-muted-foreground">Structured actions only. Voice and a free-form model are not connected.</p>
    </div>
  );
}
