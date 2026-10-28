import type { CommandFailureDetail } from "@/lib/commands/client";
import { money } from "@/lib/mgr/money";
import { integrationUnavailableReason } from "@/lib/mgr/integration-availability";

export type PublicationStatus = "requested" | "needs_snapshot" | "prepared" | "publishing" | "succeeded" | "rejected" | "superseded";

export const isTerminalPublication = (status: unknown) => status === "succeeded" || status === "rejected" || status === "superseded";

export type PublicationOutcome = { attemptId: string; status: PublicationStatus; errorCode: string | null };

export function readPublicationOutcome(payload: unknown): PublicationOutcome | null {
  const publication = payload && typeof payload === "object" ? (payload as { publication?: unknown }).publication : null;
  if (!publication || typeof publication !== "object") return null;
  const row = publication as Record<string, unknown>;
  if (typeof row.attemptId !== "string" || !isTerminalPublication(row.status)
    || (row.errorCode !== null && typeof row.errorCode !== "string")) return null;
  return { attemptId: row.attemptId, status: row.status as PublicationStatus, errorCode: row.errorCode as string | null };
}

export async function reconcileBooleanChange(
  previous: boolean,
  next: boolean,
  save: (next: boolean) => Promise<boolean>,
  setValue: (next: boolean) => void,
) {
  setValue(next);
  if (!await save(next)) setValue(previous);
}

export function shouldStartNewCommandAttempt(result: unknown, failure: CommandFailureDetail | null) {
  return Boolean(result) || failure?.kind === "definitive";
}

export type ExactCommandAttempt = { requestId: string; name: string; input: unknown };

export function selectExactCommandAttempt(
  current: ExactCommandAttempt | null,
  requested: Omit<ExactCommandAttempt, "requestId">,
  newAttempt: boolean,
  createId: () => string = () => crypto.randomUUID(),
): ExactCommandAttempt {
  return !newAttempt && current ? current : { requestId: createId(), ...requested };
}

export function syncResultMessage(kind: string, result: unknown, requestId: string | null) {
  if (!result || !requestId || typeof result !== "object") return null;
  const row = result as Record<string, unknown>;
  if (row.superseded === true) {
    return `${kind} sync superseded · attempt ${requestId}. The ${kind.toLowerCase()} was not refreshed. Start a new sync.`;
  }
  const complete = kind === "Catalog"
    ? Number.isSafeInteger(row.locations) && Number.isSafeInteger(row.variations)
    : kind === "Sales" && row.complete === true;
  return complete ? `${kind} sync complete · attempt ${requestId}` : null;
}

export function syncFailureMessage(kind: string, failure: CommandFailureDetail | null, requestId: string | null) {
  if (failure?.kind === "unknown" && requestId) return `${kind} sync outcome is unknown · attempt ${requestId}. Retry the exact attempt before starting another.`;
  if (failure?.kind === "definitive") return `${kind} sync stopped · ${failure.message}. Resolve the permission or conflict, then start a new sync.`;
  return null;
}

export function publicationNotice({ requestId, status, errorCode }: {
  requestId: string;
  status: PublicationStatus;
  errorCode?: string | null;
}) {
  if (status === "succeeded") return {
    label: "Published", detail: `Attempt ${requestId} was confirmed by Square.`, retry: false, tone: "success" as const,
  };
  if (status === "rejected") return {
    label: "Rejected", detail: `Attempt ${requestId} was rejected${errorCode ? ` · ${errorCode.replaceAll("_", " ")}` : ""}. Fix the cause before starting a corrected attempt.`, retry: false, tone: "warning" as const,
  };
  if (status === "superseded") return {
    label: "Superseded", detail: `Attempt ${requestId} no longer matches the current Square connection or catalog.`, retry: false, tone: "warning" as const,
  };
  return {
    label: "Outcome unknown",
    detail: `Attempt ${requestId} is saved. Retry this exact attempt; MGR has not confirmed publication.`,
    retry: true,
    tone: "warning" as const,
  };
}

export type PosLocationRow = {
  externalLocationId: string;
  name: string;
  detail: string;
  mgrLocationId: string;
};

/**
 * A Square variation MGR did not publish that has sold: Menu asks to map or ignore it while
 * queued, and lets a mapped or ignored one change. `target` is the current choice in the
 * Mapping picker's terms (`sku:<id>`, `format:<id>`, `ignore`, or "" while queued).
 */
export type PosVariationRow = {
  externalItemId: string;
  externalVariationId: string;
  label: string;
  detail: string;
  disposition: "queued" | "mapped" | "ignored";
  target: string;
};

/** One `list_pos_variations` row, as Menu's "Also in Square" shows it. */
export function toPosVariationRow(row: {
  externalItemId: string; externalVariationId: string; itemName: string | null; variationName: string | null;
  disposition: PosVariationRow["disposition"]; skuId: string | null; formatId: string | null; mappingLabel: string | null;
}): PosVariationRow {
  let target = "";
  if (row.disposition === "ignored") target = "ignore";
  else if (row.skuId) target = `sku:${row.skuId}`;
  else if (row.formatId) target = `format:${row.formatId}`;
  return {
    externalItemId: row.externalItemId, externalVariationId: row.externalVariationId,
    label: [row.itemName, row.variationName].filter(Boolean).join(" · ") || row.externalVariationId,
    detail: row.mappingLabel ?? "Sold in Square · not from MGR", disposition: row.disposition, target,
  };
}

export type PosSaleRow = {
  id: string;
  label: string;
  detail: string;
  amount: string;
  status: "mapped" | "queued" | "ignored" | "unsupported" | "removed";
  href?: string;
  openable?: boolean;
};

export type PosMenuItem = {
  brandId: string;
  formatId: string;
  label: string;
  retail: string;
  source: string;
  destinations: string;
  available: boolean;
  reason?: string;
  href?: string;
};

export type PosMenuModel = {
  title?: string;
  locations: { id: string; label: string; href?: string }[];
  selectedLocationId: string;
  locationName: string;
  binName?: string;
  channelName?: string;
  items: PosMenuItem[];
  excluded: PosMenuItem[];
  /** Square items MGR did not publish that have sold; the page fills this from `list_pos_variations({ selling: true })`. */
  externalItems: PosVariationRow[];
  message?: string;
  /** Set when no Square location is mapped: what is missing and, for an admin, where to fix it. */
  setup?: PosMenuSetup;
};

/** The Menu's empty state. No action for unavailable, disconnected Square or roles that cannot open settings. */
export type PosMenuSetup = { title: string; description: string; action?: { label: string; href?: string } };

/**
 * Names the missing setup step when no Square location is mapped.
 * A disconnected, unavailable Square has no action for any role. Otherwise,
 * disconnected means connect, connected with no observed locations means sync,
 * and connected with observed locations means map. Only admins get settings links.
 */
export function toPosMenuSetup({ admin, connected, configured, observed }: { admin: boolean; connected: boolean; configured: boolean; observed: number }): PosMenuSetup {
  if (!connected && !configured) return { title: "Square isn’t connected", description: integrationUnavailableReason.square };
  if (!connected) return admin
    ? { title: "Square isn’t connected", description: "Connect Square, then map a Square location to an MGR location.", action: { label: "Set up Square", href: "/settings/pos" } }
    : { title: "Square isn’t connected", description: "Ask an admin to connect Square." };
  if (observed === 0) return admin
    ? { title: "No Square locations yet", description: "Square is connected, but no locations are synced yet. Sync Square, then map a Square location to an MGR location.", action: { label: "Set up Square", href: "/settings/pos" } }
    : { title: "No Square locations yet", description: "Square is connected, but no locations are synced yet. Ask an admin to sync and map one." };
  return admin
    ? { title: "No Square location mapped", description: "Square locations were found, but none is mapped to an MGR location.", action: { label: "Map Square locations", href: "/settings/pos/locations" } }
    : { title: "No Square location mapped", description: "Square locations were found, but none is mapped to an MGR location. Ask an admin to map one." };
}

const price = (cents: number | null) => cents == null ? "No price" : money(cents);

type PosMenuSnapshotItem = {
  brandId: string; formatId: string; brand: string; format: string; priceCents: number | null;
  priceSource?: string | null; websitePublished?: boolean; available?: boolean; reason?: string;
};
export type PosMenuSnapshot = {
  location?: { name?: string }; bin?: { name?: string }; channel?: { name?: string };
  items?: PosMenuSnapshotItem[]; excluded?: PosMenuSnapshotItem[];
  /** Case stock in the menu bin offered as its child format (a case is six four-packs). */
  packaged?: { brandId: string; skuId: string; formatId: string; brand: string; format: string; qty: number; priceCents: number | null; available: boolean }[];
  /** The API's unmapped variations sold at this location; Menu reads `list_pos_variations({ selling: true })` instead. */
  externalItems?: { externalItemId: string; externalVariationId: string; itemName?: string; variationName?: string }[];
} | null;

export function toPosMenuModel(snapshot: PosMenuSnapshot, locations: { externalLocationId: string; name: string }[], selectedLocationId: string): PosMenuModel {
  const selected = locations.find(location => location.externalLocationId === selectedLocationId);
  const item = (row: PosMenuSnapshotItem): PosMenuItem => ({
    brandId: row.brandId, formatId: row.formatId, label: `${row.brand} · ${row.format}`,
    retail: price(row.priceCents), source: row.priceSource ?? "no price",
    destinations: `Square${row.websitePublished ? " · Website" : ""}`, available: Boolean(row.available),
    reason: row.reason?.replaceAll("_", " "), href: `/menu/item/${row.formatId}?brand=${row.brandId}&location=${encodeURIComponent(selectedLocationId)}`,
  });
  return {
    locations: locations.map(location => ({ ...location, id: location.externalLocationId, label: location.name, href: `/menu?location=${encodeURIComponent(location.externalLocationId)}` })),
    selectedLocationId, locationName: snapshot?.location?.name ?? selected?.name ?? "Square location",
    binName: snapshot?.bin?.name, channelName: snapshot?.channel?.name,
    items: (snapshot?.items ?? []).map(item), excluded: (snapshot?.excluded ?? []).map(item),
    externalItems: [],
    message: selected && !snapshot ? "Choose an MGR bin and sales channel before publishing." : undefined,
  };
}
