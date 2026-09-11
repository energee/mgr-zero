import type { CommandFailureDetail } from "@/lib/commands/client";

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

export type PosVariationRow = {
  externalItemId: string;
  externalVariationId: string;
  label: string;
  detail: string;
  disposition: "queued" | "ignored" | "mapped";
};

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
  externalItems: { label: string; detail: string; disposition: "queued" | "ignored"; href?: string }[];
  message?: string;
};

const money = (cents: number | null) => cents == null ? "No price" : `$${(cents / 100).toFixed(2)}`;

type PosMenuSnapshotItem = {
  brandId: string; formatId: string; brand: string; format: string; priceCents: number | null;
  priceSource?: string | null; websitePublished?: boolean; available?: boolean; reason?: string;
};
export type PosMenuSnapshot = {
  location?: { name?: string }; bin?: { name?: string }; channel?: { name?: string };
  items?: PosMenuSnapshotItem[]; excluded?: PosMenuSnapshotItem[];
  externalItems?: { itemName?: string; variationName?: string; disposition: "queued" | "ignored" }[];
} | null;

export function toPosMenuModel(snapshot: PosMenuSnapshot, locations: { externalLocationId: string; name: string }[], selectedLocationId: string): PosMenuModel {
  const selected = locations.find(location => location.externalLocationId === selectedLocationId);
  const item = (row: PosMenuSnapshotItem): PosMenuItem => ({
    brandId: row.brandId, formatId: row.formatId, label: `${row.brand} · ${row.format}`,
    retail: money(row.priceCents), source: row.priceSource ?? "no price",
    destinations: `Square${row.websitePublished ? " · Website" : ""}`, available: Boolean(row.available),
    reason: row.reason?.replaceAll("_", " "), href: `/menu/item/${row.formatId}?location=${encodeURIComponent(selectedLocationId)}`,
  });
  return {
    locations: locations.map(location => ({ ...location, id: location.externalLocationId, label: location.name, href: `/menu?location=${encodeURIComponent(location.externalLocationId)}` })),
    selectedLocationId, locationName: snapshot?.location?.name ?? selected?.name ?? "Square location",
    binName: snapshot?.bin?.name, channelName: snapshot?.channel?.name,
    items: (snapshot?.items ?? []).map(item), excluded: (snapshot?.excluded ?? []).map(item),
    externalItems: (snapshot?.externalItems ?? []).map(row => ({
      label: [row.itemName, row.variationName].filter(Boolean).join(" · "),
      detail: row.disposition === "ignored" ? "Explicitly ignored" : "Not mapped · sales stay queued",
      disposition: row.disposition, href: "/settings/pos/mapping",
    })),
    message: !selected ? "No mapped Square location is available." : !snapshot ? "Choose an MGR bin and sales channel before publishing." : undefined,
  };
}
