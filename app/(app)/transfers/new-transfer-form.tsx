// app/(app)/transfers/new-transfer-form.tsx — CommandForm for
// create_stock_transfer: source and destination locations (bins default to
// each location's first), SKU lines with quantities. Materials and kegs move
// through the same command from the API; this form draws the SKU case. A wholly
// blank spare line is left out (transferPayloadLines); any other line must be
// complete, or Create transfer stays withheld (newTransferReason) — it is never
// silently dropped. `skusHref` is Catalog only for a user who may create a SKU.
// Create transfer opens the new transfer's detail page.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { NewTransferView } from "@/components/mgr/views/new-transfer";
import { E } from "@/components/mgr/e";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { newTransferReason, transferPayloadLines } from "@/lib/mgr/new-transfer-view";

type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };
type Line = { skuId: string; qty: string };

export function NewTransferForm({ locations, bins, skus, skusHref }: { locations: Location[]; bins: Bin[]; skus: { id: string; label: string }[]; skusHref: string | null }) {
  const router = useRouter();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [fromBin, setFromBin] = useState("");
  const [toBin, setToBin] = useState("");
  const [lines, setLines] = useState<Line[]>([{ skuId: "", qty: "" }]);
  const firstBin = (loc: string) => bins.filter((b) => b.location_id === loc)[0]?.id ?? "";
  const form = useCommandForm("create_stock_transfer", {
    build: () => ({
      fromLocationId: fromId, toLocationId: toId,
      lines: transferPayloadLines(lines, fromBin, toBin),
    }),
    reset: () => { setFromId(""); setToId(""); setFromBin(""); setToBin(""); setLines([{ skuId: "", qty: "" }]); },
    onSuccess: data => router.push(`/transfers/${(data as { transferId: string }).transferId}`),
  });
  const reason = newTransferReason({ fromId, toId, fromBinId: fromBin, toBinId: toBin, lines });
  const fromBins = bins.filter(bin => bin.location_id === fromId);
  const toBins = bins.filter(bin => bin.location_id === toId);
  const model = {
    from: locations.find(location => location.id === fromId)?.name ?? "",
    fromOptions: locations.map(location => location.name),
    fromBin: fromBins.find(bin => bin.id === fromBin)?.name ?? "",
    fromBinOptions: fromBins.map(bin => bin.name),
    to: locations.find(location => location.id === toId)?.name ?? "",
    toOptions: locations.filter(location => location.id !== fromId).map(location => location.name),
    toBin: toBins.find(bin => bin.id === toBin)?.name ?? "",
    toBinOptions: toBins.map(bin => bin.name),
    skuOptions: skus.map(sku => ({ value: sku.id, label: sku.label })),
    skusHref,
    lines: lines.map(line => ({ sku: line.skuId, title: skus.find(sku => sku.id === line.skuId)?.label ?? "", qty: line.qty })),
  };
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="New transfer" trigger={<Button size="sm">New transfer</Button>}>
      <form onSubmit={event => { if (reason) { event.preventDefault(); return; } void form.submit(event); }} className="flex flex-col gap-4">
        <NewTransferView
          model={model}
          controls={{
            from: value => { const id = locations.find(location => location.name === value)?.id ?? ""; setFromId(id); setFromBin(firstBin(id)); },
            fromBin: value => setFromBin(fromBins.find(bin => bin.name === value)?.id ?? ""),
            to: value => { const id = locations.find(location => location.name === value)?.id ?? ""; setToId(id); setToBin(firstBin(id)); },
            toBin: value => setToBin(toBins.find(bin => bin.name === value)?.id ?? ""),
            lineSku: (index, value) => setLines(previous => previous.map((line, lineIndex) => lineIndex === index ? { ...line, skuId: value } : line)),
            lineQty: (index, value) => setLines(previous => previous.map((line, lineIndex) => lineIndex === index ? { ...line, qty: value } : line)),
            addLine: () => setLines(previous => [...previous, { skuId: "", qty: "" }]),
            removeLine: index => setLines(previous => previous.filter((_, lineIndex) => lineIndex !== index)),
          }}
          messages={<CommandFormMessage error={form.error} />}
          footer={<CommandFormFooter>{E.submit("Create transfer", { submitting: form.submitting, reason, busy: "Creating…" })}</CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}
