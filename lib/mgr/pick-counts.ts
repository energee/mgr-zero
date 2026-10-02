// Tab-local working pick observations; never submitted command or recovery state.
import { z } from "zod";
import type { CommandContextExpectation } from "@/lib/commands/registry";
import type { PickSnapshot } from "./pick-view";

const pickDraft = z.record(z.string(), z.object({ value: z.string(), ordered: z.number(), picked: z.number().nullable(), shortPickEventId: z.string().optional() }));
function draftCounts(lines: PickSnapshot["lines"], values: Record<string, string>) {
  return Object.fromEntries(lines.map(line => [line.id, {
    value: values[line.id], ordered: line.qty_ordered, picked: line.qty_picked, shortPickEventId: line.shortPickEventId,
  }]));
}
type PickStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Working observations are private to this actor, brewery, order and browser tab. */
export function pickCountDraftKey(context: CommandContextExpectation, orderId: string) {
  return `mgr:pick-counts:${context.actorId}:${context.breweryId}:${orderId}`;
}

/** Server-changed lines win; unchanged lines keep their unsaved text, including a cleared field. */
export function readPickCounts(lines: PickSnapshot["lines"], saved: string | null): Record<string, string> {
  const draft = saved === null ? {} : pickDraft.parse(JSON.parse(saved));
  return Object.fromEntries(lines.map(line => {
    const kept = draft[line.id];
    return [line.id, kept && kept.ordered === line.qty_ordered && kept.picked === line.qty_picked && kept.shortPickEventId === line.shortPickEventId
      ? kept.value : String(line.qty_picked ?? line.qty_ordered)];
  }));
}

/** Save observations only, never a command or its recovery identity. Storage errors reach the form. */
export function savePickCounts(storage: PickStorage, key: string, lines: PickSnapshot["lines"], values: Record<string, string>) {
  storage.setItem(key, JSON.stringify(draftCounts(lines, values)));
}

/** A committed shortage must reload this line from get_order, even when its count did not change. */
export function reconcileShortPick(storage: PickStorage, key: string, lineId: string) {
  const saved = storage.getItem(key);
  if (saved === null) return;
  let draft: z.infer<typeof pickDraft>;
  try { draft = pickDraft.parse(JSON.parse(saved)); }
  catch {
    // A malformed observation record cannot be restored; retire it after the committed resolution.
    storage.removeItem(key);
    return;
  }
  delete draft[lineId];
  storage.setItem(key, JSON.stringify(draft));
}
