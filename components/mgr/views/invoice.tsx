// components/mgr/views/invoice.tsx — the Invoice screen drawing, read as a
// document (#977): number, state and customer, then Issued/Due beside the
// price summary (stacked on the phone, summary before the lines), a line
// table on the desk and labeled line records on the phone, the payments
// recorded in MGR (#1045), QuickBooks and accounting, buyer questions, and
// Return in a closing section. RecordPaymentView and VoidPaymentView are the
// payment sheets' bodies, shared by the inventory
// sheets and the live forms in payment-form.tsx. Inventory and
// the live page both pass toInvoiceViewProps(get_invoice-shaped data); the
// live page supplies authorized actions through the slots (an explicit null
// suppresses a slot; omitted draws the inert fixture control).
import type { ReactNode } from "react";
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { FactsGrid } from "@/components/mgr/views/facts-grid";
import { PriceSummary } from "@/components/mgr/views/price-summary";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QboStaffInvoiceLinkView } from "./accounting";
import { InvoiceAccountingActionsView } from "./invoice-accounting";
import { PAYMENT_METHODS } from "@/lib/mgr/enums";
import { PAYMENT_METHOD_LABEL, sentenceCase } from "@/lib/mgr/labels";
import type { QboStaffInvoiceLink } from "@/lib/mgr/qbo-ui";
import { invoicePaymentAmountError, type InvoicePaymentValue, type InvoicePaymentView, type InvoiceQuestionView, type InvoiceViewModel } from "@/lib/mgr/invoice-view";
import { cn } from "@/lib/utils";

const H2 = "text-base font-semibold";
const LEGEND = "text-xs text-muted-foreground";
const NUMBER_COLUMNS = [["Quantity", "qty"], ["Unit price", "unitPrice"]] as const;
const METHOD_OPTIONS = [{ value: "", label: "Select a method", disabled: true }, ...PAYMENT_METHODS.map((value) => ({ value, label: PAYMENT_METHOD_LABEL[value] }))];

/** The Record payment sheet's body, fields like KegPoolFields: amount capped at
 *  the balance, received day capped at the brewery's today, method,
 *  reference. Without onChange the fields draw the value uncontrolled, as the
 *  inventory does. A bad amount is marked under Amount once `amountTouched`
 *  (the live form sets it on `onAmountBlur`), or at once in the inventory. At a
 *  QuickBooks-connected brewery it warns that payments stop the push. Then the
 *  live form's submit footer, or the inert Record payment button when omitted. */
export function RecordPaymentView({ value, maxCents, maxDate, quickbooksConnected, onChange, amountTouched = false, onAmountBlur, footer }: {
  value: InvoicePaymentValue; maxCents: number; maxDate: string; quickbooksConnected: boolean; onChange?: (next: InvoicePaymentValue) => void;
  amountTouched?: boolean; onAmountBlur?: () => void; footer?: ReactNode;
}) {
  const set = <K extends keyof InvoicePaymentValue>(key: K) => onChange ? (next: InvoicePaymentValue[K]) => onChange({ ...value, [key]: next }) : undefined;
  const amountError = !onChange || amountTouched ? invoicePaymentAmountError(value.amount, maxCents) : undefined;
  return (
    <>
      {quickbooksConnected ? E.note("This invoice will not be sent to QuickBooks while it has payments recorded in MGR.") : null}
      {E.edit("Amount ($)", value.amount, "number", undefined, { id: "payment-amount", min: 0, max: maxCents / 100, step: 0.01, onChange: set("amount"), onBlur: onAmountBlur, error: amountError, required: true })}
      {E.edit("Received on", value.receivedOn, "date", undefined, { max: maxDate, onChange: set("receivedOn"), required: true })}
      {/* E.pick hands back a plain string; METHOD_OPTIONS holds only "" and PaymentMethod values, so the cast is safe (as in KegPoolFields). */}
      {E.pick("Method", value.method, METHOD_OPTIONS, { id: "payment-method", onChange: set("method") as ((v: string) => void) | undefined, required: true })}
      {E.edit("Reference · optional", value.reference, "text", undefined, { id: "payment-reference", maxLength: 200, onChange: set("reference") })}
      {footer !== undefined ? footer : E.btn("Record payment")}
    </>
  );
}

/** The Void payment sheet's body: voiding keeps the payment row and needs a
 *  reason (the only correction, #1045). Footer omitted: the inert Confirm void. */
export function VoidPaymentView({ paymentId, amount, reason = "", onReasonChange, footer }: {
  paymentId: string; amount: string; reason?: string; onReasonChange?: (next: string) => void; footer?: ReactNode;
}) {
  return (
    <>
      <p className="text-sm text-muted-foreground">The {amount} payment stays on the invoice, marked voided with this reason. An invoice that drops below its total is no longer paid.</p>
      {E.edit("Reason", reason, "text", undefined, { id: `void-reason-${paymentId}`, required: true, maxLength: 500, onChange: onReasonChange })}
      {footer !== undefined ? footer : E.btn("Confirm void", "del")}
    </>
  );
}

/** The Return button: a link to the return form on the live page, inert in the inventory. */
export const InvoiceReturnButton = ({ href }: { href?: string }) => (
  <Button variant="outline" type="button" className="w-full md:w-auto" asChild={Boolean(href)}>
    {href ? <Link href={href}>Return</Link> : "Return"}
  </Button>
);

export function InvoiceView({
  model,
  correction,
  questionAction,
  recordPayment,
  paymentAction,
  mappings = model.mappings,
  qbo,
  qboGate,
  quickbooks,
  accountingActions,
  staffLink,
}: {
  model: InvoiceViewModel;
  /** The closing Correct a shipment control. Omitted: the inert Return button; null: no section. */
  correction?: ReactNode;
  questionAction?: ReactNode | ((question: InvoiceQuestionView) => ReactNode);
  /** The Payments section's Record payment control. Omitted: the inert button when the model takes a payment (paymentBalanceCents set); null: none. */
  recordPayment?: ReactNode;
  /** The control on each unvoided payment. Omitted: the inert Void button; null: none. */
  paymentAction?: ReactNode | ((payment: InvoicePaymentView) => ReactNode);
  mappings?: InvoiceViewModel["mappings"];
  /** Replaces the whole QuickBooks region; null draws none. */
  qbo?: ReactNode;
  /** A gate message while integration is unavailable. */
  qboGate?: ReactNode;
  /** qboInvoicePresentation's detail: the invoice's accounting state, said once. */
  quickbooks?: { detail: string };
  accountingActions?: ReactNode;
  staffLink?: QboStaffInvoiceLink | null;
}) {
  const mappingRows = qbo !== undefined || qboGate ? undefined : mappings;
  const unanswered = (q: InvoiceQuestionView) => {
    if (typeof questionAction === "function") return questionAction(q);
    return questionAction !== undefined ? questionAction : <Button variant="outline" size="sm" type="button">Mark answered</Button>;
  };
  const record = recordPayment !== undefined ? recordPayment
    : model.paymentBalanceCents != null ? <Button variant="outline" size="sm" type="button">Record payment</Button> : null;
  const paymentControl = (p: InvoicePaymentView) => {
    if (typeof paymentAction === "function") return paymentAction(p);
    return paymentAction !== undefined ? paymentAction : <Button variant="outline" size="sm" type="button">Void</Button>;
  };
  const actions = accountingActions !== undefined ? accountingActions
    : mappingRows?.length ? <InvoiceAccountingActionsView invoiceLabel={model.title} actions={["fix_mapping"]} /> : null;
  const showLink = Boolean(quickbooks || mappingRows?.length);
  const hasAccounting = qbo !== undefined ? qbo != null : Boolean(qboGate || quickbooks || mappingRows?.length || actions);
  const openCount = model.questions.filter((q) => !q.answered).length;
  return (
    <div className="flex flex-col gap-6 [overflow-wrap:anywhere]">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem] md:gap-8">
        <div className="min-w-0">
          <header>
            {E.back("Invoices", <span className="flex flex-wrap items-center gap-2">{model.title}{E.status(model.state.label, model.state.tone)}</span>, undefined, model.backHref)}
            <p className="mt-1.5 text-base font-semibold">{model.customer}</p>
          </header>
          <section aria-labelledby="invoice-details" className="mt-2">
            <h2 id="invoice-details" className="sr-only">Invoice details</h2>
            <FactsGrid facts={model.facts} />
          </section>
        </div>
        <PriceSummary model={model.summary} />
      </div>

      <section aria-labelledby="invoice-lines" className="border-t pt-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="invoice-lines" className={H2}>Line items</h2>
          <span className={LEGEND}>{model.lines.length} {model.lines.length === 1 ? "line" : "lines"}</span>
        </div>
        <div className="mt-2 hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-0 text-xs">Description</TableHead>
                {NUMBER_COLUMNS.map(([label]) => <TableHead key={label} className="text-right text-xs">{label}</TableHead>)}
                <TableHead className="pr-0 text-right text-xs">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {model.lines.map((line) => (
                <TableRow key={line.key}>
                  <TableCell className="py-3.5 pl-0 whitespace-normal">
                    <span className="font-medium">{line.name}</span>
                    {line.description ? <p className={LEGEND}>{line.description}</p> : null}
                  </TableCell>
                  {NUMBER_COLUMNS.map(([label, field]) => <TableCell key={label} className="text-right tabular-nums">{line[field]}</TableCell>)}
                  <TableCell className="pr-0 text-right font-semibold tabular-nums">{line.amount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ul className="mt-1 divide-y md:hidden">
          {model.lines.map((line) => (
            <li key={line.key} className="py-4">
              <p className="text-sm font-semibold">{line.name}</p>
              {line.description ? <p className={LEGEND}>{line.description}</p> : null}
              <dl className="mt-3 grid grid-cols-3 gap-x-4">
                {([["Quantity", line.qty], ["Unit price", line.unitPrice], ["Amount", line.amount]] as const).map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className={LEGEND}>{label}</dt>
                    <dd className={cn("mt-0.5 text-sm tabular-nums", label === "Amount" ? "font-semibold" : "font-medium")}>{value}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </section>

      {model.payments.length || record ? (
        <section aria-labelledby="invoice-payments" className="border-t pt-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="invoice-payments" className={H2}>Payments</h2>
            {record}
          </div>
          {model.payments.length ? (
            <ul className="mt-1 divide-y">
              {model.payments.map((p) => (
                <li key={p.key}>
                  {E.row(
                    p.amount,
                    <>
                      {[`Received ${p.receivedOn}`, p.method, p.reference].filter(Boolean).join(" · ")}
                      {p.voidReason ? <span className="block">Voided: {p.voidReason}</span> : null}
                    </>,
                    p.voidReason ? E.status("Voided") : paymentControl(p),
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {hasAccounting ? (
        <section aria-labelledby="invoice-accounting" className="flex flex-col gap-3 border-t pt-5">
          <h2 id="invoice-accounting" className={H2}>QuickBooks and accounting</h2>
          {qbo !== undefined ? qbo : (
            <>
              {typeof qboGate === "string" ? E.gated("QuickBooks", qboGate) : qboGate}
              {quickbooks || actions || staffLink?.href ? (
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  {quickbooks ? <p className="text-sm font-semibold">{sentenceCase(quickbooks.detail)}</p> : null}
                  <div className="flex flex-col gap-2 md:ml-auto md:items-end">
                    {showLink && staffLink?.href ? <QboStaffInvoiceLinkView link={staffLink} /> : null}
                    {actions}
                  </div>
                </div>
              ) : null}
              {showLink && !staffLink?.href ? <QboStaffInvoiceLinkView link={staffLink} /> : null}
              {mappingRows?.length ? (
                <div className="flex flex-col">
                  {mappingRows.map((row) => (
                    <div key={row.key}>{E.row(row.title, row.detail, row.unavailable ? E.status("Mapping unavailable", "w") : "", row.tone ?? "")}</div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {model.questions.length ? (
        <section aria-labelledby="invoice-questions" className="border-t pt-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="invoice-questions" className={H2}>Buyer questions</h2>
            <span className={LEGEND}>{openCount} unanswered · {model.questions.length - openCount} answered</span>
          </div>
          <ul className="mt-1 divide-y">
            {model.questions.map((q) => (
              <li key={q.key} className="flex flex-col gap-2 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className={LEGEND}>Asked {q.askedOn}</p>
                  {q.answered ? E.status("Answered", "ok") : null}
                </div>
                <p className="text-sm">“{q.body}”</p>
                {q.answered ? null : <div>{unanswered(q)}</div>}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {correction === null ? null : (
        <section aria-labelledby="invoice-correction" className="flex flex-col gap-3 border-t pt-5 md:flex-row md:items-center md:justify-between">
          <h2 id="invoice-correction" className={H2}>Correct a shipment</h2>
          {correction ?? <InvoiceReturnButton />}
        </section>
      )}
    </div>
  );
}
