"use client";
import { useId, useState, type FormEventHandler, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import type { QboMappingKind, QboMappingSection } from "@/lib/mgr/accounting-view";

export type { QboMappingKind };

export function QboMappingSheetView({ context = "accounting", currentId, open, onOpenChange, children }: { context?: "accounting" | "invoice"; currentId?: string | null; open?: boolean; onOpenChange?: (open: boolean) => void; children: ReactNode }) {
  const [localOpen, setLocalOpen] = useState(false);
  return <CommandForm open={open ?? localOpen} onOpenChange={onOpenChange ?? setLocalOpen} title={context === "invoice" ? "Fix mapping" : "Mapping conflict"} trigger={<Button variant="outline" size="sm">{currentId ? "Change" : "Map"}</Button>}>{children}</CommandForm>;
}

const recordNames: Record<QboMappingKind, string> = {
  customer: "customer", item: "item", deposit: "item", one_way_fee: "item", vendor: "vendor", purchase_account: "account",
};
export type MappingRow = QboMappingSection["rows"][number] & { action?: ReactNode };
export function QboMappingsView({ title, backLabel, backHref, context = "accounting", connected = true, company, sections, depositHref }: {
  title: string; backLabel: string; backHref?: string; context?: "accounting" | "invoice"; connected?: boolean; company?: string | null;
  sections: { title?: string; empty?: string; rows: MappingRow[] }[]; depositHref?: string;
}) {
  return <>
    {E.back(backLabel, title, undefined, backHref)}
    {!connected ? E.note("Connect QuickBooks before saving mappings.") : E.info(`Verify each record in ${company ?? "the connected QuickBooks company"}. MGR never chooses automatically from a matching name.`)}
    {sections.map((section, index) => <div className="flex flex-col gap-3" key={section.title ?? index}>
      {section.title && E.ttl(section.title)}
      {!section.rows.length && section.empty && E.blank(section.empty)}
      {section.rows.map(row => <div key={row.id}>{E.row(row.label, row.currentId ? `QuickBooks ${recordNames[row.kind]} ${row.currentId}` : row.detail ?? "Not mapped", connected ? row.action !== undefined ? row.action : <QboMappingSheetView context={context} currentId={row.currentId}><QboMappingView kind={row.kind} label={row.label} defaultValue={row.currentId ?? ""} companyConflict={context === "accounting"} /></QboMappingSheetView> : "", row.currentId ? "ok" : "w")}</div>)}
    </div>)}
    {depositHref && E.row("Returnable-keg deposit", "Configured from Accounting", E.act("Open Accounting mappings", "attention", depositHref))}
  </>;
}

export function QboMappingView({ kind, label, value, defaultValue = "", onChange, onSubmit, busy = false, error, companyConflict = false }: {
  kind: QboMappingKind; label?: string; value?: string; defaultValue?: string;
  onChange?: (value: string) => void; onSubmit?: FormEventHandler<HTMLFormElement>;
  busy?: boolean; error?: string | null; companyConflict?: boolean;
}) {
  const id = useId(), [draft, setDraft] = useState(defaultValue);
  const remoteId = value ?? draft;
  return <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); if (!busy && remoteId.trim()) onSubmit?.(event); }}>
    {label && E.fld("Mapping", label)}
    {E.note("Verify the intended record in the connected QuickBooks company and enter its exact ID. MGR never chooses automatically from a matching name.")}

    {kind === "purchase_account" && E.info("One brewery-wide purchase account is used for every receipt Bill. Payments are managed only in QuickBooks.")}
    {E.edit("QuickBooks " + recordNames[kind] + " ID", remoteId, "text", undefined, { onChange: (nextValue: string) => { setDraft(nextValue); onChange?.(nextValue); }, id, disabled: busy, required: true })}
    <CommandFormMessage error={error} />
    <CommandFormFooter><Button disabled={busy || !remoteId.trim()}>{busy ? "Saving…" : "Save mapping"}</Button></CommandFormFooter>
    {companyConflict && E.info("If this QuickBooks company belongs to another MGR brewery, disconnect it there first.")}
  </form>;
}
