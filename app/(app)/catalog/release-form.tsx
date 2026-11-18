// app/(app)/catalog/release-form.tsx — live portal release sheets (admin and
// sales). ReleaseForm is Release for ordering (release_sku) on a Planning
// batch row or a SKU row; EditReleaseForm (update_release) and
// WithdrawRelease (withdraw_release) act on an open release's SKU-list row.
// The drawings are components/mgr/views/release.tsx.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { EditReleaseView, ReleaseView } from "@/components/mgr/views/release";
import { ConfirmDeleteControl } from "@/components/mgr/views/confirm-delete";
import { useCommandAction, useCommandForm } from "@/lib/commands/use-command-form";
import { releaseCommand, updateReleaseCommand, type ReleaseForm as Form, type ReleaseRow } from "@/lib/mgr/release-view";

/** `forms` are the sources to choose from (batchReleaseForms gives one, skuReleaseForms several); the first is the default. */
export function ReleaseForm({ title, forms }: { title: string; forms: Form[] }) {
  const [form, setForm] = useState(forms[0]);
  const reset = () => setForm(forms[0]);
  const command = releaseCommand(form);
  const sheet = useCommandForm(command.name, { build: () => command.input, reset });
  const line = (index: number, change: Partial<Form["lines"][number]>) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l, i) => (i === index ? { ...l, ...change } : l)) }));
  return (
    <CommandForm open={sheet.open} onOpenChange={sheet.setOpen} title={title} trigger={<Button variant="outline" size="sm">Release for ordering</Button>}>
      <form onSubmit={(event) => { if (command.reason) { event.preventDefault(); return; } void sheet.submit(event); }} className="flex flex-col gap-4">
        <ReleaseView form={form} sources={forms}
          controls={{
            source: (key) => setForm(forms.find((f) => f.key === key) ?? forms[0]),
            include: (index, include) => line(index, { include }),
            qty: (index, qty) => line(index, { qty }),
            shipsFrom: (shipsFrom) => setForm((f) => ({ ...f, shipsFrom })),
            ordersCloseOn: (ordersCloseOn) => setForm((f) => ({ ...f, ordersCloseOn })),
          }}
          messages={<CommandFormMessage error={sheet.error} />}
          footer={<CommandFormFooter>{E.submit("Release for ordering", { submitting: sheet.submitting, reason: command.reason })}</CommandFormFooter>} />
      </form>
    </CommandForm>
  );
}

export function EditReleaseForm({ release }: { release: ReleaseRow }) {
  const [qty, setQty] = useState(String(release.qty));
  const [ordersCloseOn, setOrdersCloseOn] = useState(release.orders_close_on ?? "");
  const reset = () => { setQty(String(release.qty)); setOrdersCloseOn(release.orders_close_on ?? ""); };
  const command = updateReleaseCommand(release, qty, ordersCloseOn);
  const sheet = useCommandForm(command.name, { build: () => command.input, reset });
  return (
    <CommandForm open={sheet.open} onOpenChange={sheet.setOpen} title={`Edit release · ${release.sku_name}`} trigger={<Button variant="outline" size="sm">Edit</Button>}>
      <form onSubmit={(event) => { if (command.reason) { event.preventDefault(); return; } void sheet.submit(event); }} className="flex flex-col gap-4">
        <EditReleaseView qty={qty} ordersCloseOn={ordersCloseOn} confirmed={release.confirmed}
          controls={{ qty: setQty, ordersCloseOn: setOrdersCloseOn }}
          messages={<CommandFormMessage error={sheet.error} />}
          footer={<CommandFormFooter>{E.submit("Save release", { submitting: sheet.submitting, reason: command.reason })}</CommandFormFooter>} />
      </form>
    </CommandForm>
  );
}

export function WithdrawRelease({ release }: { release: ReleaseRow }) {
  const { busy, error, run } = useCommandAction();
  return <ConfirmDeleteControl title="Withdraw release" triggerLabel="Withdraw" size="sm" busy={busy} error={error} busyLabel="Withdrawing…" dismissLabel="Keep release"
    name={`Withdraw this release of ${release.sku_name}?`}
    warning="Buyers can no longer order from it. Orders already submitted stay; handle them at Confirm order."
    onDelete={() => run("withdraw_release", { releaseId: release.id })} />;
}
