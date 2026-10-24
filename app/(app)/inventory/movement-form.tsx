// app/(app)/inventory/movement-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the record_movement command.
// Picking a location preselects its first bin (list_bins is alphabetical), so the common case is one tap.
// No movement type is preselected: the user picks one, unless a deep link passed it (#1107).
// Record movement names what it still needs (movementReason), a wrong quantity
// or state is marked on its field, and an empty SKU picker links Catalog only
// when `skusHref` is set (#1113).
"use client";

import { command } from "@/lib/commands/client";
import { useBrewery } from "@/lib/brewery-provider";
import type { BinMoveStock } from "@/lib/commands/inventory";
import { MOVEMENT_KIND_LABELS, MOVEMENT_TYPES, movementFieldErrors, movementFields, movementReason, requiresChannel, requiresDestState, type MovementType } from "@/lib/movement-form";
import { sentenceCase } from "@/lib/mgr/labels";
import { formatVolume } from "@/lib/volume";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { IrreversibleSubmit } from "@/components/mgr/irreversible-submit";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { MovementRecordedView } from "@/components/mgr/views/movement-recorded";
import { RecordMovementView, type RecordMovementViewModel } from "@/components/mgr/views/record-movement";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { formatDateTime } from "@/lib/date-format";
import { toMovementRecordedViewProps } from "@/lib/mgr/movement-recorded-view";
import type { MovementInput } from "@/lib/commands/movement-input";

type MovementReceipt = { id: string; created_at: string; sku_id: string; location_id: string; bin_id: string; qty: number; bbl: number; type: string; dest_state: string | null; sale_channel_id: string | null; lot_id: string | null; ref: string | null; note: string | null };

export function MovementForm({
  autoOpen = false,
  initial,
  skus,
  locations,
  bins,
  channels,
  timeZone,
  skusHref,
}: {
  /** True when the page URL carries ?recordMovement=1 (Today's shortcut or
   *  Ask MGR's Open as form): the form starts open, and closing it clears that
   *  deep link from the URL (#1107). */
  autoOpen?: boolean;
  initial?: Partial<MovementInput>;
  skus: { id: string; label: string; bblPerUnit: number | null }[];
  locations: { id: string; name: string; uses: string[] }[];
  bins: { id: string; location_id: string; name: string }[];
  channels: { id: string; name: string }[];
  /** breweries.timezone: the receipt prints the movement time in it (#442). */
  timeZone: string;
  /** Catalog, for a user who may create a SKU (create_sku); null otherwise. */
  skusHref: string | null;
}) {
  const breweryId = useBrewery();
  const router = useRouter();
  const [receipt, setReceipt] = useState<MovementReceipt | null>(null);
  const [stock, setStock] = useState<BinMoveStock[]>([]);
  const [lotId, setLotId] = useState(initial?.lotId ?? "");
  const [stockError, setStockError] = useState<string | null>(null);
  const [skuId, setSkuId] = useState(initial?.skuId ?? "");
  const [locationId, setLocationId] = useState(initial?.locationId ?? "");
  const [binId, setBinId] = useState(initial?.binId ?? "");
  const [qty, setQty] = useState(initial?.qty == null ? "" : String(Math.abs(initial.qty)));
  const [direction, setDirection] = useState<"add" | "remove">((initial?.qty ?? 1) < 0 ? "remove" : "add");
  const [destState, setDestState] = useState(initial?.destState ?? "");
  const [type, setType] = useState<MovementType | "">((initial?.type as MovementType | undefined) ?? "");
  // A hand-entered movement is a taproom event far more often than not, so
  // Taproom is preselected when the brewery still has that seeded channel.
  const defaultChannelId = (channels.find((c) => c.name === "Taproom") ?? channels[0])?.id ?? "";
  const [saleChannelId, setSaleChannelId] = useState(initial?.saleChannelId ?? defaultChannelId);
  const [note, setNote] = useState(initial?.note ?? "");
  const form = useCommandForm("record_movement", {
    defaultOpen: autoOpen,
    onSuccess: data => setReceipt(data as MovementReceipt),
    build: () => ({ skuId, locationId, binId, lotId: lotId || undefined, ...movementFields(type, qty, direction, destState, saleChannelId), type, note: note || undefined }),
    reset: () => { setStockError(null); setLotId(""); setStock([]); setSkuId(""); setLocationId(""); setBinId(""); setQty(""); setType(""); setSaleChannelId(defaultChannelId); setNote(""); setDestState(""); setDirection("add"); },
  });

  useEffect(() => {
    if (!locationId || !form.open) return;
    let live = true;
    command(breweryId, "get_bin_move_stock", { locationId }).then(data => { if (live) { setStock(data as BinMoveStock[]); setStockError(null); } }).catch(err => { if (live) setStockError(String(err)); });
    return () => { live = false; };
  }, [breweryId, locationId, form.open]);
  const reason = movementReason({ type, skuId, locationId, binId, saleChannelId, qty, destState });
  const fields = reason ? null : movementFields(type, qty, direction, destState, saleChannelId);
  const unitVolume = skus.find(s => s.id === skuId)?.bblPerUnit;
  const receiptModel = receipt ? toMovementRecordedViewProps({
    sku: skus.find(s => s.id === receipt.sku_id)?.label ?? receipt.sku_id,
    qty: receipt.qty,
    unit: "SKU unit",
    kind: sentenceCase(receipt.type),
    destState: receipt.dest_state ?? undefined,
    bbl: String(receipt.bbl),
    when: formatDateTime(receipt.created_at, timeZone),
    details: [
      { label: "Location", value: `${locations.find(l => l.id === receipt.location_id)?.name ?? receipt.location_id} / ${bins.find(b => b.id === receipt.bin_id)?.name ?? receipt.bin_id}` },
      ...(receipt.sale_channel_id ? [{ label: "Channel", value: channels.find(c => c.id === receipt.sale_channel_id)?.name ?? receipt.sale_channel_id }] : []),
      ...(receipt.lot_id ? [{ label: "Lot", value: receipt.lot_id }] : []),
      ...(receipt.note ? [{ label: "Note", value: receipt.note }] : []),
      { label: "Movement reference", value: receipt.id },
      ...(receipt.ref ? [{ label: "Source reference", value: receipt.ref }] : []),
    ],
  }) : null;
  const selectedSku = skus.find(item => item.id === skuId);
  const selectedLocation = locations.find(item => item.id === locationId);
  const selectedBin = bins.find(item => item.id === binId);
  const selectedChannel = channels.find(item => item.id === saleChannelId);
  const availableLots = stock.filter(item => item.kind === "sku" && item.stock_id === skuId && item.bin_id === binId && item.lot_id);
  const lotOptions = ["No lot (untracked)", ...availableLots.map(item => `${item.lot_code} · ${item.qty} available`)];
  const movementModel: RecordMovementViewModel = {
    // An empty `kind` shows the Select movement type placeholder and
    // no pressed toggle.
    kind: sentenceCase(type), kindOptions: MOVEMENT_KIND_LABELS,
    sku: selectedSku?.label ?? "", skuId, skuOptions: skus.map(item => ({ value: item.id, label: item.label })), skusHref,
    location: selectedLocation?.name ?? "", locationOptions: locations.map(item => item.name),
    bin: selectedBin?.name ?? "", binOptions: bins.filter(item => item.location_id === locationId).map(item => item.name),
    // The channels are the brewery's own rows, read by list_sale_channels.
    channel: selectedChannel?.name ?? "", channelOptions: requiresChannel(type) ? channels.map(item => item.name) : [],
    destState, destStateOptions: [], destStateInput: requiresDestState(type),
    qty, errors: movementFieldErrors(type, qty, destState),
    preview: fields ? `Preview: ${fields.qty > 0 ? "+" : ""}${fields.qty} SKU units${unitVolume != null ? ` · ${formatVolume(fields.qty * unitVolume)}` : ""} · ${sentenceCase(type)}${fields.destState ? ` · ${fields.destState}` : ""}. Volume is calculated when recorded.` : undefined,
    direction: type === "adjustment" ? direction === "add" ? "Add stock" : "Remove stock" : undefined,
    directionOptions: type === "adjustment" ? ["Add stock", "Remove stock"] : undefined,
    lot: lotId ? availableLots.map(item => ({ id: item.lot_id, label: `${item.lot_code} · ${item.qty} available` })).find(item => item.id === lotId)?.label ?? lotId : "No lot (untracked)",
    lotOptions,
    note,
  };

  function onTypeChange(next: MovementType) {
    setType(next);
  }

  // When a deep link opened this form, replace the URL so a reload or Back
  // does not reopen it (#1107). The new URL keeps only ?page, so the prefill
  // values (skuId, type, qty and the rest) leave the URL too.
  // A successful record closes the form through useCommandForm, not here.
  // The URL stays until the receipt is dismissed, because page.tsx keys this
  // form on ?movementHandoff: dropping it early would remount the form and
  // lose the receipt.
  function clearDeepLinkUrl() {
    if (!autoOpen) return;
    const page = new URLSearchParams(window.location.search).get("page");
    router.replace(page ? `/inventory?${new URLSearchParams({ page })}` : "/inventory", { scroll: false });
  }

  function dismissReceiptAndClearDeepLink() {
    setReceipt(null);
    clearDeepLinkUrl();
  }

  return (
    <>
    <CommandForm open={form.open} onOpenChange={open => { form.setOpen(open); if (!open) clearDeepLinkUrl(); }} title="Record movement" trigger={<Button>Record movement</Button>}>
        <form onSubmit={e => { if (!fields) { e.preventDefault(); return; } void form.submit(e); }} className="flex flex-col gap-4">
          <RecordMovementView
            model={movementModel}
            controls={{
              kind: value => { const next = MOVEMENT_TYPES[MOVEMENT_KIND_LABELS.indexOf(value)]; if (next) onTypeChange(next); },
              sku: value => { setSkuId(value); setLotId(""); },
              location: value => { const id = locations.find(item => item.name === value)?.id ?? ""; setLocationId(id); setLotId(""); setBinId(bins.find(item => item.location_id === id)?.id ?? ""); },
              bin: value => { setBinId(bins.find(item => item.location_id === locationId && item.name === value)?.id ?? ""); setLotId(""); },
              channel: value => setSaleChannelId(channels.find(item => item.name === value)?.id ?? ""),
              destState: value => setDestState(value.toUpperCase()),
              direction: value => setDirection(value === "Remove stock" ? "remove" : "add"),
              lot: value => setLotId(value === "No lot (untracked)" ? "" : availableLots.find(item => `${item.lot_code} · ${item.qty} available` === value)?.lot_id ?? ""),
              qty: setQty,
              note: setNote,
            }}
            messages={<><CommandFormMessage error={stockError} /><CommandFormMessage error={form.error} /></>}
            footer={<CommandFormFooter>
            <IrreversibleSubmit label="Record movement" busy="Recording…" submitting={form.submitting} reason={reason} />
          </CommandFormFooter>}
          />
        </form>
      </CommandForm>
      <CommandForm open={receipt !== null} onOpenChange={open => { if (!open) dismissReceiptAndClearDeepLink(); }} title="Movement recorded">
        {receiptModel && <MovementRecordedView model={receiptModel} footer={<Button onClick={dismissReceiptAndClearDeepLink}>Done</Button>} />}
      </CommandForm>
    </>
  );
}
