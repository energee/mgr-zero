// components/mgr/fixture-adapters.tsx — inventory-only adapters that hold
// local state for controlled shared views (FormatView, CatalogCategoriesControl),
// so the explorer drawing is interactive without the views keeping a fixture copy.
// Nothing under app/ imports this; live forms own the same state and call commands.
"use client";

import { cloneElement, useState, type ComponentProps, type ReactElement, type ReactNode } from "react";
import type { FormatView } from "@/components/mgr/views/format";
import { CatalogCategoriesControl } from "@/components/mgr/views/catalog-categories";
import { deleteCategory, saveCategory } from "@/lib/mgr/catalog-categories-view";
import { formatControls, type FormatViewModel } from "@/lib/mgr/format-view";
import type { ReceiptView } from "@/components/mgr/views/receipt";
import type { StaffRole } from "@/lib/commands/registry";
import { receiptPoBillPending, receiptPoBillPosted } from "@/lib/mgr/fixtures/purchasing";
import { hasAnyRole } from "@/lib/mgr/roles";
import type { WeeklyCountView } from "@/components/mgr/views/weekly-count";
import type { EntryView } from "@/components/mgr/views/entry";
import type { RouteErrorView } from "@/components/mgr/views/route-error";
import type { AccountingView } from "@/components/mgr/views/accounting";
import { DeliveryOutcomeForm, type ConfirmDeliveryView, type DeliveryReadout } from "@/components/mgr/views/confirm-delivery";
import { DriverRouteView } from "@/components/mgr/views/driver-route";
import { RefusedReturnStatusView, type RefusedReturnFormView } from "@/components/mgr/views/refused-return";
import { driverRouteA } from "@/lib/mgr/fixtures/delivery";

/** Reset submission stays on this card, just as the live Auth response does. */
export function ResetPasswordFixture({ children }: { children: ReactElement<ComponentProps<typeof EntryView>> }) {
  const [sent, setSent] = useState(false);
  return cloneElement(children, {
    model: { ...children.props.model, info: sent ? "If that email is on an account, a reset link is on its way." : undefined },
    action: () => setSent(true),
  });
}

/** Retrying replaces the failed subtree with the same shared destination view. */
export function RouteErrorFixture({ children, recovered }: {
  children: ReactElement<ComponentProps<typeof RouteErrorView>>; recovered: ReactNode;
}) {
  const [retried, setRetried] = useState(false);
  return retried ? recovered : cloneElement(children, { onRetry: () => setRetried(true) });
}

/** Payment preferences change only this connected inventory company's state. */
export function AccountingFixture({ children }: { children: ReactElement<ComponentProps<typeof AccountingView>> }) {
  const [model, setModel] = useState(children.props.model);
  return cloneElement(children, {
    model,
    onDefaultsChange: (allowAch, allowCard) => setModel(previous => ({ ...previous, defaults: { allowAch, allowCard } })),
  });
}

/** Records the entered outcome locally, or removes an unattempted stop from its route. */
export function ConfirmDeliveryFixture({ children }: { children: ReactElement<ComponentProps<typeof ConfirmDeliveryView>> }) {
  const [model, setModel] = useState(children.props.model);
  const [readout, setReadout] = useState<DeliveryReadout>();
  const [left, setLeft] = useState(false);
  return left ? <DriverRouteView model={{
    ...driverRouteA,
    stops: driverRouteA.stops.slice(1).map((stop, index) => index === 0 ? { ...stop, detail: "Next", verb: "Deliver", warning: true } : stop),
  }} /> : cloneElement(children, {
    model,
    readout,
    action: <DeliveryOutcomeForm lines={model.lines} initialSignedBy={model.receivedBy} receivedSuggestions={model.receivedSuggestions}
      onLeave={() => setLeft(true)}
      onSubmit={input => {
        const refused = new Map(input.refused.map(line => [line.orderLineId, line.qty]));
        const fullRefusal = model.lines.every(line => refused.get(line.key) === Number(line.qty));
        setModel(previous => ({ ...previous, lines: previous.lines.map(line => {
          const refusedQty = refused.get(line.key) ?? 0;
          return { ...line, qty: `${Number(line.qty) - refusedQty} accepted · ${refusedQty} refused` };
        }) }));
        setReadout({
          kind: "delivered", receivedBy: input.signedBy, transfer: false,
          outcome: fullRefusal ? "Refused" : refused.size ? "Partial" : "Delivered",
          invoice: fullRefusal ? "No invoice · full refusal" : "INV-0241",
          refused: refused.size > 0, checkInHref: "/docs/screens-explore#q=Check+in+refused+beer",
        });
      }} />,
  });
}

/** Each physical check-in subtracts only its entered quantities from outstanding refusals. */
export function RefusedReturnFixture({ children }: { children: ReactElement<ComponentProps<typeof RefusedReturnFormView>> }) {
  const [model, setModel] = useState(children.props.model);
  return model.lines.length ? cloneElement(children, {
    model,
    key: model.lines.map(line => `${line.id}:${line.outstanding}`).join(","),
    onSubmit: input => setModel(previous => ({
      ...previous,
      lines: previous.lines.map(line => {
        const received = input.lines.find(entry => entry.orderLineId === line.id)?.sources.reduce((total, source) => total + source.qty, 0) ?? 0;
        return { ...line, outstanding: line.outstanding - received };
      }).filter(line => line.outstanding > 0),
    })),
  }) : <RefusedReturnStatusView />;
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
