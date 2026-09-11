// app/(app)/inventory/movement-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the record_movement command.
// Picking a location preselects its first bin (list_bins is alphabetical), so the common case is one tap.
"use client";

import { command } from "@/lib/commands/client";
import { useBrewery } from "../brewery-provider";
import type { BinMoveStock } from "@/lib/commands/inventory";
import { movementFields, movementTypeLabel } from "@/lib/movement-form";
import { formatVolume } from "@/lib/volume";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { MovementRecordedView } from "@/components/mgr/views/movement-recorded";
import { RecordMovementView, type RecordMovementViewModel } from "@/components/mgr/views/record-movement";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { formatDateTime } from "@/lib/date-format";
import { toMovementRecordedViewProps } from "@/lib/mgr/movement-recorded-view";
import type { MovementInput } from "@/lib/composer/state";

// Staff-facing movement types; sale_removal/taproom_transfer are produced by
// order flows (plan 1B), not entered manually here.
const MOVEMENT_TYPES = [
  "opening_balance", "production_in", "adjustment", "depletion",
  "destruction", "loss", "sample", "festival_removal", "return_in",
] as const;
type MovementReceipt = { id: string; created_at: string; sku_id: string; location_id: string; bin_id: string; qty: number; bbl: number; type: string; dest_state: string | null; sale_channel_id: string | null; lot_id: string | null; ref: string | null; note: string | null };
type MovementType = (typeof MOVEMENT_TYPES)[number];

// Mirrors the DB CHECK (removal_shape): sale_removal and depletion each name a
// channel, and only depletion is staff-facing here (sale_removal comes from
// shipping). The channels are the brewery's own rows, read by list_sale_channels.
const requiresChannel = (type: MovementType) => type === "depletion";

export function MovementForm({
  autoOpen = false,
  initial,
  skus,
  locations,
  bins,
  channels,
}: {
  autoOpen?: boolean;
  initial?: Partial<MovementInput>;
  skus: { id: string; label: string; bblPerUnit: number | null }[];
  locations: { id: string; name: string; kind: string }[];
  bins: { id: string; location_id: string; name: string }[];
  channels: { id: string; name: string }[];
}) {
  const breweryId = useBrewery();
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
  const [type, setType] = useState<MovementType>((initial?.type as MovementType | undefined) ?? "opening_balance");
  // A hand-entered movement is a taproom event far more often than not, so
  // Taproom is preselected when the brewery still has that seeded channel.
  const defaultChannelId = (channels.find((c) => c.name === "Taproom") ?? channels[0])?.id ?? "";
  const [saleChannelId, setSaleChannelId] = useState(initial?.saleChannelId ?? defaultChannelId);
  const [note, setNote] = useState(initial?.note ?? "");
  const form = useCommandForm("record_movement", {
    onSuccess: data => setReceipt(data as MovementReceipt),
    build: () => ({ skuId, locationId, binId, lotId: lotId || undefined, ...movementFields(type, qty, direction, destState, saleChannelId), type, note: note || undefined }),
    reset: () => { setLotId(""); setStock([]); setSkuId(""); setLocationId(""); setBinId(""); setQty(""); setType("opening_balance"); setSaleChannelId(defaultChannelId); setNote(""); setDestState(""); setDirection("add"); },
  });
  const { setOpen } = form;
  const autoOpened = useRef(false);

  useEffect(() => {
    if (autoOpen && !autoOpened.current) {
      autoOpened.current = true;
      setOpen(true);
    }
  }, [autoOpen, setOpen]);

  useEffect(() => {
    if (!locationId || !form.open) return;
    let live = true;
    command(breweryId, "get_bin_move_stock", { locationId }).then(data => { if (live) { setStock(data as BinMoveStock[]); setStockError(null); } }).catch(err => { if (live) setStockError(String(err)); });
    return () => { live = false; };
  }, [breweryId, locationId, form.open]);
  let fields: ReturnType<typeof movementFields> | null = null;
  try { fields = movementFields(type, qty, direction, destState, saleChannelId); } catch { /* Incomplete inputs disable submission. */ }
  const unitVolume = skus.find(s => s.id === skuId)?.bblPerUnit;
  const receiptModel = receipt ? toMovementRecordedViewProps({
    sku: skus.find(s => s.id === receipt.sku_id)?.label ?? receipt.sku_id,
    qty: receipt.qty,
    unit: "SKU unit",
    kind: movementTypeLabel(receipt.type),
    destState: receipt.dest_state ?? undefined,
    bbl: String(receipt.bbl),
    when: formatDateTime(receipt.created_at),
    backHref: "/inventory",
    details: [
      { label: "Location", value: `${locations.find(l => l.id === receipt.location_id)?.name ?? receipt.location_id} / ${bins.find(b => b.id === receipt.bin_id)?.name ?? receipt.bin_id}` },
      ...(receipt.sale_channel_id ? [{ label: "Channel", value: channels.find(c => c.id === receipt.sale_channel_id)?.name ?? receipt.sale_channel_id }] : []),
      ...(receipt.lot_id ? [{ label: "Lot", value: receipt.lot_id }] : []),
      ...(receipt.note ? [{ label: "Note", value: receipt.note }] : []),
      { label: "Movement reference", value: receipt.id },
      ...(receipt.ref ? [{ label: "Source reference", value: receipt.ref }] : []),
    ],
  }) : null;
  const kindOptions = MOVEMENT_TYPES.map(value => value.replaceAll("_", " "));
  const selectedSku = skus.find(item => item.id === skuId);
  const selectedLocation = locations.find(item => item.id === locationId);
  const selectedBin = bins.find(item => item.id === binId);
  const selectedChannel = channels.find(item => item.id === saleChannelId);
  const availableLots = stock.filter(item => item.kind === "sku" && item.stock_id === skuId && item.bin_id === binId && item.lot_id);
  const lotOptions = ["Untracked / legacy stock", ...availableLots.map(item => `${item.lot_code} · ${item.qty} available`)];
  const movementModel: RecordMovementViewModel = {
    kind: type.replaceAll("_", " "), kindIndex: MOVEMENT_TYPES.indexOf(type), kindOptions,
    sku: selectedSku?.label ?? "", skuOptions: skus.map(item => item.label),
    location: selectedLocation?.name ?? "", locationOptions: locations.map(item => item.name),
    bin: selectedBin?.name ?? "", binOptions: bins.filter(item => item.location_id === locationId).map(item => item.name),
    channel: selectedChannel?.name ?? "", channelOptions: requiresChannel(type) ? channels.map(item => item.name) : [],
    destState, destStateOptions: [], destStateInput: type === "sample" || type === "festival_removal",
    qty,
    preview: fields && skuId ? `Preview: ${fields.qty > 0 ? "+" : ""}${fields.qty} SKU units${unitVolume != null ? ` · ${formatVolume(fields.qty * unitVolume)}` : ""} · ${type.replaceAll("_", " ")}${fields.destState ? ` · ${fields.destState}` : ""}. Volume is calculated when recorded.` : "Complete the required fields to preview this movement.",
    direction: type === "adjustment" ? direction === "add" ? "Add stock" : "Remove stock" : undefined,
    directionOptions: type === "adjustment" ? ["Add stock", "Remove stock"] : undefined,
    lot: lotId ? availableLots.map(item => ({ id: item.lot_id, label: `${item.lot_code} · ${item.qty} available` })).find(item => item.id === lotId)?.label ?? lotId : "Untracked / legacy stock",
    lotOptions,
    note,
  };

  function onTypeChange(next: MovementType) {
    setType(next);
  }

  return (
    <>
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Record movement" trigger={<Button>Record movement</Button>}>
        <form onSubmit={e => { if (!fields) { e.preventDefault(); return; } void form.submit(e); }} className="flex flex-col gap-4">
          <RecordMovementView
            model={movementModel}
            controls={{
              kind: value => { const next = MOVEMENT_TYPES[kindOptions.indexOf(value)]; if (next) onTypeChange(next); },
              sku: value => { setSkuId(skus.find(item => item.label === value)?.id ?? ""); setLotId(""); },
              location: value => { const id = locations.find(item => item.name === value)?.id ?? ""; setLocationId(id); setLotId(""); setBinId(bins.find(item => item.location_id === id)?.id ?? ""); },
              bin: value => { setBinId(bins.find(item => item.location_id === locationId && item.name === value)?.id ?? ""); setLotId(""); },
              channel: value => setSaleChannelId(channels.find(item => item.name === value)?.id ?? ""),
              destState: value => setDestState(value.toUpperCase()),
              direction: value => setDirection(value === "Remove stock" ? "remove" : "add"),
              lot: value => setLotId(value === "Untracked / legacy stock" ? "" : availableLots.find(item => `${item.lot_code} · ${item.qty} available` === value)?.lot_id ?? ""),
              qty: setQty,
              note: setNote,
            }}
            messages={<><CommandFormMessage error={stockError} /><CommandFormMessage error={form.error} /></>}
            footer={<CommandFormFooter>
            <Button type="submit" disabled={form.submitting || !fields || (requiresChannel(type) && !saleChannelId) || !skuId || !locationId || !binId}>
              {form.submitting ? "Recording…" : "Record movement"}
            </Button>
          </CommandFormFooter>}
          />
        </form>
      </CommandForm>
      <CommandForm open={receipt !== null} onOpenChange={open => { if (!open) setReceipt(null); }} title="Movement recorded">
        {receiptModel && <MovementRecordedView model={receiptModel} footer={<Button onClick={() => setReceipt(null)}>Done</Button>} />}
      </CommandForm>
    </>
  );
}
