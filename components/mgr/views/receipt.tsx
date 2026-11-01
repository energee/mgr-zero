"use client";

// Shared receipt confirmation; the live adapter selects a committed receipt.
import { E } from "@/components/mgr/e";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import type { ReceiptViewModel } from "@/lib/mgr/receipt-view";

export function ReceiptView({ model, onPostBill, busy = false, error }: {
  model: ReceiptViewModel; onPostBill?: () => Promise<boolean>; busy?: boolean; error?: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const bill = model.bill;
  const retry = bill?.action === "retry";
  const corrected = bill?.action === "corrected";
  return (
    <>
      {E.back(model.backTo ?? "Purchase orders", model.title, undefined, model.backHref)}
      {E.fld("Status", model.status)}
      {E.fld("Still owed", model.stillOwed)}
      {E.tape(model.tape)}
      {E.info(model.info)}
      {bill && <>
        {E.ttl("QuickBooks Bill")}
        {E.fld("Bill status", bill.status === "pushed" ? `Posted${bill.billId ? ` · Bill ${bill.billId}` : ""}`
          : bill.status === "pending" ? "Posting result unknown" : bill.status === "push_failed" ? "Rejected by QuickBooks" : "Not posted")}
        {bill.status === "pushed" && E.info("Bill posted, adjust in QuickBooks")}
        {bill.status === "pending" && E.note("The original Bill snapshot is frozen, including its vendor, purchase account and counted receipt costs. Retry checks QuickBooks for that Bill first. If absent, it resends the exact saved request with the original provider request ID, never a new attempt or corrected receipt quantities.")}
        {bill.status === "push_failed" && E.note("QuickBooks rejected the Bill. Fix the exact vendor or purchase account mapping, then explicitly confirm Post corrected Bill. A rejected attempt is never silently retried as a new Bill.")}
        {bill.status === "not_posted" && bill.superseded && E.note("This receipt was corrected. Open its latest revision to post the Bill.")}
        {bill.connectionRequired && E.note("Connect QuickBooks in Settings → Accounting before posting or reconciling a receipt Bill.")}
        {bill.mappingHref && E.row(bill.connectionRequired ? "QuickBooks connection required" : "Vendor and purchase account mapping required",
          "Verify the exact IDs in Settings → Accounting → mappings.", E.act("Fix Accounting mappings", "attention", bill.mappingHref))}
        {E.info("Bill payments are managed only in QuickBooks. MGR does not record or sync Bill payments.")}
        <CommandFormMessage error={bill.error} />
        <CommandFormMessage error={error} />
        {bill.action && <CommandForm open={confirming} onOpenChange={open => { if (!busy) setConfirming(open); }}
          title={retry ? "Reconcile receipt Bill in QuickBooks?" : corrected ? "Post corrected Bill to QuickBooks?" : "Post receipt Bill to QuickBooks?"}
          trigger={E.btn(retry ? "Retry exact Bill" : corrected ? "Post corrected Bill" : "Post Bill to QuickBooks", busy || !onPostBill ? "p disabled" : "p", undefined, undefined, { "data-preview-action": true })}>
          <form className="flex flex-col gap-3" data-preview-action onSubmit={event => event.preventDefault()}>
            {E.note(retry
              ? "Check QuickBooks for the original frozen Bill first. If it is absent, resend that exact saved snapshot with the same provider request ID. Do not create a new attempt, change its vendor or account, or include later receipt corrections."
              : corrected ? "QuickBooks definitively rejected the previous attempt. Create a corrected Bill using the verified current mappings and receipt details. This is a new attempt, not reconciliation of an unknown result."
                : "Create one Bill for this receipt using the exact mapped vendor, the brewery-wide purchase account, and each receipt movement's saved unit cost × counted base quantity. Later corrections must be adjusted in QuickBooks.")}
            {E.info("Payments are QuickBooks-only.")}
            <CommandFormMessage error={error} />
            <CommandFormFooter><Button type="button" disabled={busy || !onPostBill} onClick={async () => {
              if (!busy && await onPostBill?.()) setConfirming(false);
            }}>{busy ? "Checking…" : retry ? "Confirm exact Bill retry" : corrected ? "Confirm corrected Bill" : "Confirm post Bill"}</Button></CommandFormFooter>
          </form>
        </CommandForm>}
      </>}
      {model.revisions?.map(revision => <div key={revision.label}>{E.nav(revision.label, "Receipt history", "", undefined, revision.href, "Receipt")}</div>)}
      {model.correction && E.act("Correct receipt", "attention", model.correction.href)}
    </>
  );
}
