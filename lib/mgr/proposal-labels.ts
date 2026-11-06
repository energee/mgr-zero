// lib/mgr/proposal-labels.ts — turns a proposed command's input into rows a person
// can read on an approval card. A person must not approve `skuId: 8f3a…`, so each
// id shows as the record's name. Every read goes through ctx.db, so RLS applies.
// An id with no name shows as an unrecognised record with a warning, never hidden.
// Which kind an id field points to comes from `entity` in the field vocabulary.
// ID_KINDS_BY_COMMAND covers the names that mean different things in different commands.
import { getCommandDefinition, inChunks, rows, unwrap, type Ctx } from "@/lib/commands/registry";
import { leafFields, valuesAt } from "@/lib/mgr/api-schema";
import { FIELD_VOCABULARY, fieldMeaning, isIdField } from "@/lib/mgr/field-vocabulary";
import { sentenceCase } from "@/lib/mgr/labels";
import { RECORD_LABELS, type RecordLabel, type Row } from "@/lib/mgr/record-labels";

export type ProposalRow = { field: string; meaning?: string; value: unknown; unit?: string; warning?: true };

type Names = Map<string, string>;

/** Id fields whose kind depends on the command, keyed by field and then command.
 * This wins over the vocabulary. A field with two kinds tries both: ids are unique across tables. */
const ID_KINDS_BY_COMMAND: Record<string, Record<string, string[]>> = {
  id: {
    upsert_brand: ["brand"], upsert_format: ["format"], upsert_sale_channel: ["sale_channel"], upsert_price_group: ["price_group"],
    upsert_customer: ["customer"], upsert_ship_to: ["ship_to"], upsert_vessel: ["vessel"], upsert_vendor: ["vendor"],
    upsert_material: ["material"], upsert_material_contract: ["material_contract"], save_route: ["route"], upsert_brand_approval: ["brand_approval"],
  },
  lotId: {
    record_movement: ["lot"], ship_order: ["lot"], record_repack: ["lot"], record_taproom_count: ["lot"],
    close_packaging_run: ["material_lot"], correct_packaging_material_record: ["material_lot"], record_batch_addition: ["material_lot"],
    record_brew_day: ["material_lot"], save_batch_pulls: ["material_lot"], correct_brew_record: ["material_lot"],
    receive_stock_transfer: ["lot", "material_lot"],
  },
  lineId: {
    record_pick: ["order_line"], ship_order: ["order_line"], resolve_short_pick: ["order_line"],
    record_stock_transfer_pick: ["stock_transfer_line"], receive_stock_transfer: ["stock_transfer_line"],
    correct_taproom_count: ["taproom_count_line"],
  },
  recordId: { correct_packaging_material_record: ["packaging_material_record"], correct_brew_record: ["brew_record"] },
  connectionId: { disconnect_qbo: ["qbo_connection"], disconnect_square: ["pos_connection"] },
  deliveryId: { confirm_delivery: ["delivery"], leave_delivery_for_later: ["delivery"], check_in_refused_return: ["delivery"] },
  previousCorrectionId: { correct_packaging_run_outputs: ["packaging_output_correction"] },
  userId: { revoke_customer_user: ["customer_user"] },
  inviteId: { accept_account_invitation: ["my_invitation"] },
};

/** Kinds with no table a person can read. Each is named by the granted function its own screen uses.
 * `input` is the proposal's input: list_customer_users needs the customer. */
const FUNCTION_READS: Record<string, (ctx: Ctx, input: unknown) => Promise<[id: string, name: string][]>> = {
  user: async ctx => (await unwrap(ctx.db.rpc("list_team_members", { p_brewery: ctx.breweryId })))!
    .map(member => [member.user_id, member.name]),
  customer_user: async (ctx, input) => (await unwrap(ctx.db.rpc("list_customer_users", {
    p_brewery: ctx.breweryId, p_customer: (input as { customerId: string }).customerId,
  })))!.map(buyer => [buyer.user_id, buyer.email]),
  invitation: async ctx => (await unwrap(ctx.db.rpc("list_pending_invitations", { p_brewery: ctx.breweryId })))!
    .map(invite => [invite.id, `${invite.email} · ${sentenceCase(invite.role)}`]),
  my_invitation: async ctx => ((await unwrap(ctx.db.rpc("list_my_invitations"))) as { id: string; breweryName: string; role: string }[])
    .map(invite => [invite.id, `${sentenceCase(invite.role)} at ${invite.breweryName}`]),
  chat_conversation: async ctx => ((await unwrap(ctx.db.rpc("list_chat_conversations", { p_brewery: ctx.breweryId }))) as { id: string; title: string }[])
    .map(conversation => [conversation.id, conversation.title]),
  chat_link: async ctx => ((await unwrap(ctx.db.rpc("list_chat_user_links", { p_brewery: ctx.breweryId }))) as { id: string; name: string }[])
    .map(link => [link.id, link.name]),
  chat_installation: async ctx => {
    const { installation } = (await unwrap(ctx.db.rpc("get_chat_integration_health", { p_brewery: ctx.breweryId }))) as unknown as
      { installation: { id: string; workspace: string } | null };
    return installation ? [[installation.id, installation.workspace]] : [];
  },
};

const LABELS: Record<string, RecordLabel> = RECORD_LABELS;

/** Every kind of record this module can name. */
export const LABEL_KINDS = [...Object.keys(LABELS), ...Object.keys(FUNCTION_READS)];

/** The kinds an id field can name in this command. Empty means nothing can name it. */
export function idFieldKinds(command: string, field: string): string[] {
  const kinds = ID_KINDS_BY_COMMAND[field]?.[command] ?? [FIELD_VOCABULARY[field]?.entity];
  return kinds.filter((kind): kind is string => kind !== undefined && LABEL_KINDS.includes(kind));
}

/** The names of `ids` of one kind, in one query. An id this person cannot read has no entry. */
export async function readNames(ctx: Ctx, kind: string, ids: string[], input: unknown): Promise<Names> {
  if (kind in FUNCTION_READS) return new Map(await FUNCTION_READS[kind](ctx, input));
  const { table, select, key = "id", label } = LABELS[kind];
  // The table and columns vary by kind, so the client's per-table types cannot apply.
  // Naming one table here satisfies the compiler. `rows` then says what came back.
  const found = await inChunks(ids, chunk => rows<Row>(
    ctx.db.from(table as "skus").select(select).eq("brewery_id", ctx.breweryId).in(key as "id", chunk)));
  return new Map(found.map(row => [row[key] as string, label(row)]));
}

/** readNames for a card. A card must still open when a read fails. That is safe because every
 * id of this kind then shows a warning, and approving runs the command's own checks. */
async function namesForCard(ctx: Ctx, kind: string, ids: string[], input: unknown): Promise<Names> {
  try {
    return await readNames(ctx, kind, ids, input);
  } catch (error) {
    console.error(`proposal labels: ${kind} read failed:`, error);
    return new Map();
  }
}

/** A proposal's input as rows for its approval card, one per value the input holds. */
export async function labelProposal(ctx: Ctx, commandName: string, input: unknown): Promise<ProposalRow[]> {
  const definition = getCommandDefinition(commandName);
  if (!definition) throw new Error(`proposal labels: unknown command ${commandName}`);
  // A union lists a field once per alternative shape, so keep one entry per place in the input.
  // `id` stays null for a null id: that means "no record", not an unrecognised one.
  const entries = [...new Map(leafFields(definition.input).flatMap(field =>
    valuesAt(input, field.path).map(({ at, value }) => [at, {
      at, value, field, id: isIdField(field.name) && typeof value === "string" ? value : null,
    }] as const))).values()];

  const idsByKind = new Map<string, Set<string>>();
  for (const { field, id } of entries) {
    if (id === null) continue;
    for (const kind of idFieldKinds(commandName, field.name)) {
      idsByKind.set(kind, (idsByKind.get(kind) ?? new Set()).add(id));
    }
  }
  const names = new Map(await Promise.all([...idsByKind].map(async ([kind, ids]) =>
    [kind, await namesForCard(ctx, kind, [...ids], input)] as const)));

  return entries.map(({ at, value, field, id }) => {
    const row = { field: at, ...fieldMeaning(field) };
    if (id === null) return { ...row, value };
    const name = idFieldKinds(commandName, field.name).map(kind => names.get(kind)?.get(id)).find(Boolean);
    return name ? { ...row, value: name } : { ...row, value: `Unrecognised record ${id}`, warning: true };
  });
}
