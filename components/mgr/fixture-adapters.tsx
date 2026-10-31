// components/mgr/fixture-adapters.tsx — inventory-only adapters that hold
// local state for controlled shared views (FormatView, CatalogCategoriesControl),
// so the explorer drawing is interactive without the views keeping a fixture copy.
// Nothing under app/ imports this; live forms own the same state and call commands.
"use client";

import { cloneElement, useState, type ComponentProps, type ReactElement } from "react";
import type { FormatView } from "@/components/mgr/views/format";
import { CatalogCategoriesControl } from "@/components/mgr/views/catalog-categories";
import { deleteCategory, saveCategory } from "@/lib/mgr/catalog-categories-view";
import { formatControls, type FormatViewModel } from "@/lib/mgr/format-view";
import type { ReceiptView } from "@/components/mgr/views/receipt";
import type { StaffRole } from "@/lib/commands/registry";
import { receiptPoBillPending, receiptPoBillPosted } from "@/lib/mgr/fixtures/purchasing";
import { hasAnyRole } from "@/lib/mgr/roles";
import type { WeeklyCountView } from "@/components/mgr/views/weekly-count";
import type { TransferDetailView } from "@/components/mgr/views/transfer-detail";

/** Receive and cancellation stay local while using the same transfer drawing. */
export function TransferDetailFixture({ children }: { children: ReactElement<ComponentProps<typeof TransferDetailView>> }) {
  const [model, setModel] = useState(children.props.model);
  return cloneElement(children, {
    model,
    actions: {
      onReceive: () => setModel(previous => ({ ...previous, status: "Received", received: true, nextVerb: undefined })),
      onCancel: async reason => {
        setModel(previous => ({ ...previous, status: "Cancelled", cancelReason: reason, nextVerb: undefined }));
        return true;
      },
    },
  });
}

/** Keeps the selected receipt and its current worksheet as distinct inventory states. */
export function WeeklyCountFixture({ children }: { children: ReactElement<ComponentProps<typeof WeeklyCountView>> }) {
  const [worksheet, setWorksheet] = useState(false);
  return cloneElement(children, {
    model: worksheet ? { ...children.props.model, receipt: undefined } : children.props.model,
    onWorksheet: () => setWorksheet(true),
  });
}

/** Wraps the inventory `<FormatView>` as a child, so the drawn element stays FormatView
 *  (screen-view-composition finds it) while this adapter owns its state. */
export function FormatFixture({ children }: { children: ReactElement<ComponentProps<typeof FormatView>> }) {
  const [model, setModel] = useState(children.props.model);
  const [components, setComponents] = useState([{ id: "", qty: "1" }]);
  const patch = (next: Partial<FormatViewModel>) => setModel(previous => ({ ...previous, ...next }));
  return cloneElement(children, { model, controls: formatControls(model, patch), componentRows: components, onComponentRowsChange: setComponents });
}

export function CatalogCategoriesFixture({ categories }: { categories: string[] }) {
  const [names, setNames] = useState(categories);
  const [error, setError] = useState<string | null>(null);
  return <CatalogCategoriesControl categories={names} error={error}
    onSave={async (next, previous) => {
      const result = saveCategory(names, next, previous);
      if ("error" in result) { setError(result.error); return false; }
      setError(null); setNames(result.names); return true;
    }}
    onDelete={async name => { setNames(deleteCategory(names, name)); return true; }} />;
}

/** Inventory-only simulation: a lost response followed by successful reconciliation. */
export function ReceiptFixture({ children, roles = ["admin"] }: {
  children: ReactElement<ComponentProps<typeof ReceiptView>>; roles?: readonly StaffRole[];
}) {
  const [model, setModel] = useState(children.props.model);
  const canPost = hasAnyRole(roles, ["admin"]);
  return cloneElement(children, {
    model: canPost || !model.bill ? model : { ...model, bill: { ...model.bill, action: undefined, mappingHref: undefined } },
    onPostBill: canPost ? async () => {
      setModel(previous => ({ ...previous, bill: previous.bill?.status === "pending" ? receiptPoBillPosted.bill : receiptPoBillPending.bill }));
      return true;
    } : undefined,
  });
}
