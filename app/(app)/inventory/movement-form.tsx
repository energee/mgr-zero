// app/(app)/inventory/movement-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the record_movement command.
// Picking a location preselects its first bin (list_bins is alphabetical), so the common case is one tap.
// No movement type is preselected: the user picks one, unless a deep link passed it (#1107).
// Record movement names what it still needs (movementReason), a wrong quantity
// or state is marked on its field, and an empty SKU picker links Catalog only
// when `skusHref` is set (#1113). A deep link with `from` (Today's quick
// action) goes back there when the form closes or its receipt is dismissed (#1475).
"use client";

import { classifyCommandFailure, command } from "@/lib/commands/client";
import { useBrewery } from "@/lib/brewery-provider";
import type { BinMoveStock } from "@/lib/commands/inventory";
import { MOVEMENT_KIND_LABELS, MOVEMENT_TYPES, movementFieldErrors, movementFields, movementReason, requiresChannel, requiresDestState, type MovementType } from "@/lib/movement-form";
import { sentenceCase } from "@/lib/mgr/labels";
import { formatVolume } from "@/lib/volume";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { passwordReturnHref } from "@/lib/mgr/entry-view";
import { Button } from "@/components/ui/button";
import { IrreversibleSubmit } from "@/components/mgr/irreversible-submit";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { MovementRecordedView } from "@/components/mgr/views/movement-recorded";
import { RecordMovementView, type RecordMovementViewModel } from "@/components/mgr/views/record-movement";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { formatDateTime } from "@/lib/date-format";
import { toMovementRecordedViewProps } from "@/lib/mgr/movement-recorded-view";
import type { MovementInput } from "@/lib/commands/movement-input";

type MovementReceipt = { id: string; created_at: string; sku_id: string; location_id: string; bin_id: string; qty: number; bbl: number; type: string; dest_state: string | null; sale_channel_id: string | null; lot_id: string | null; lot_code: string | null; ref: string | null; note: string | null };

export function MovementForm({
  initial,
  initialLot,
  skus,
  locations,
  bins,
  channels,
  timeZone,
  skusHref,
}: {
  initial?: Partial<MovementInput>;
  initialLot?: { id: string; code: string } | null;
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
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const movementOpen = pathname === "/inventory" && searchParams.get("recordMovement") === "1";
  const [receipt, setReceipt] = useState<MovementReceipt | null>(null);
  const [stock, setStock] = useState<BinMoveStock[]>([]);
  const [lotId, setLotId] = useState(initialLot?.id ?? initial?.lotId ?? "");
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
    onSuccess: data => {
      const movement = data as MovementReceipt;
      setReceipt({ ...movement, lot_code: lotChoices.find(lot => lot.id === movement.lot_id)?.code ?? null });
    },
    build: () => ({ skuId, locationId, binId, lotId: lotId || undefined, ...movementFields(type, qty, direction, destState, saleChannelId), type, note: note || undefined }),
    reset: () => { setStockError(null); setLotId(""); setStock([]); setSkuId(""); setLocationId(""); setBinId(""); setQty(""); setType(""); setSaleChannelId(defaultChannelId); setNote(""); setDestState(""); setDirection("add"); },
  });

  useEffect(() => {
    if (!locationId || !movementOpen || receipt) return;
    let live = true;
    command(breweryId, "get_bin_move_stock", { locationId }).then(data => { if (live) { setStock(data as BinMoveStock[]); setStockError(null); } }).catch(err => { if (live) setStockError(classifyCommandFailure(err).message); });
    return () => { live = false; };
  }, [breweryId, locationId, movementOpen, receipt]);
  const availableLots = stock.filter((item): item is BinMoveStock & { lot_id: string } => item.kind === "sku" && item.stock_id === skuId && item.bin_id === binId && item.lot_id !== null);
  const lotChoices = availableLots.map(lot => ({ id: lot.lot_id, code: lot.lot_code, label: `${lot.lot_code} · ${lot.qty} available` }));
  if (initialLot?.id === lotId && !lotChoices.some(lot => lot.id === initialLot.id)) {
    lotChoices.push({ id: initialLot.id, code: initialLot.code, label: initialLot.code });
  }
  const reason = movementReason({ type, skuId, locationId, binId, saleChannelId, qty, destState })
    ?? (lotId && !lotChoices.some(lot => lot.id === lotId && lot.code) ? "Still needed: a readable lot. Choose an available lot or No lot (untracked)." : null);
  const fields = reason ? null : movementFields(type, qty, direction, destState, saleChannelId);
  const unitVolume = skus.find(s => s.id === skuId)?.bblPerUnit;
  const receiptModel = receipt ? toMovementRecordedViewProps({
    sku: skus.find(s => s.id === receipt.sku_id)?.label ?? "—",
    qty: receipt.qty,
    unit: "SKU unit",
    kind: sentenceCase(receipt.type),
    destState: receipt.dest_state ?? undefined,
    bbl: String(receipt.bbl),
    when: formatDateTime(receipt.created_at, timeZone),
    details: [
      { label: "Location", value: `${locations.find(l => l.id === receipt.location_id)?.name ?? "—"} / ${bins.find(b => b.id === receipt.bin_id)?.name ?? "—"}` },
      ...(receipt.sale_channel_id ? [{ label: "Channel", value: channels.find(c => c.id === receipt.sale_channel_id)?.name ?? "—" }] : []),
      ...(receipt.lot_code ? [{ label: "Lot", value: receipt.lot_code }] : []),
      ...(receipt.note ? [{ label: "Note", value: receipt.note }] : []),
    ],
  }) : null;
  const selectedSku = skus.find(item => item.id === skuId);
  const selectedLocation = locations.find(item => item.id === locationId);
  const selectedBin = bins.find(item => item.id === binId);
  const selectedChannel = channels.find(item => item.id === saleChannelId);
  const lotOptions = [{ value: "", label: "No lot (untracked)" }, ...lotChoices.map(lot => ({ value: lot.id, label: lot.label }))];
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
    lot: lotId ? lotChoices.find(lot => lot.id === lotId)?.label ?? "—" : "No lot (untracked)",
    lotId, lotOptions,
    note,
  };

  function onTypeChange(next: MovementType) {
    setType(next);
  }

  // A closing dialog owns only the URL it rendered, never a newer navigation.
  function ownsCurrentUrl() {
    return pathname === "/inventory" && window.location.pathname === pathname
      && new URLSearchParams(window.location.search).toString() === search;
  }

  // Native history updates Next's URL hooks synchronously without queuing an
  // RSC navigation that could overwrite a subsequent Today/Ask MGR handoff.
  // Keep the handoff until its receipt closes so its key and receipt survive.
  function clearDeepLinkUrl() {
    if (!movementOpen || !ownsCurrentUrl()) return;
    const params = new URLSearchParams(search);
    for (const key of ["recordMovement", "movementHandoff", "skuId", "locationId", "binId", "lotId", "qty", "type", "saleChannelId", "destState", "note"]) {
      params.delete(key);
    }
    const query = params.toString();
    window.history.replaceState(null, "", `/inventory${query ? `?${query}` : ""}${window.location.hash}`);
  }

  // Back to the page that sent us (only an in-app path), else stay on Finished goods.
  function leave() {
    const from = searchParams.get("from");
    if (from) router.replace(passwordReturnHref(from));
    else clearDeepLinkUrl();
  }

  function changeOpen(open: boolean) {
    if (!ownsCurrentUrl()) return;
    form.setOpen(open);
    if (!open) {
      leave();
      return;
    }
    const params = new URLSearchParams(search);
    params.set("recordMovement", "1");
    window.history.pushState(null, "", `/inventory?${params}${window.location.hash}`);
  }

  function dismissReceiptAndClearDeepLink() {
    if (!ownsCurrentUrl()) return;
    setReceipt(null);
    leave();
  }

  return (
    <>
    <CommandForm open={movementOpen && receipt === null} onOpenChange={changeOpen} title="Record movement" trigger={<Button>Record movement</Button>}>
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
              lot: setLotId,
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
