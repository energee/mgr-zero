// components/mgr/views/release-settings-form.tsx — the Releases section of
// Settings (docs/plans/release-pool-and-ceilings.md): the release form's
// defaults, when customer limits lift, how calculated limits are worked out,
// and the weekly digest's day. Its own form, saved only by Save releases. Under
// it, each customer's limit as it stands today.
"use client";

import { Fragment, useId, useState } from "react";
import { E } from "@/components/mgr/e";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { DIGEST_DAYS, releaseDefaultsCommand, releaseShareLine, type ReleaseSettingsValues, type ReleaseShareRow } from "@/lib/mgr/release-settings-view";

export function ReleaseSettingsFormView({ initial, shares = [], onSave, busy = false, error = null }: {
  initial: ReleaseSettingsValues;
  /** list_release_shares: each customer's limit today. */
  shares?: ReleaseShareRow[];
  onSave?: (values: ReleaseSettingsValues) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [values, setValues] = useState(initial);
  const id = useId();
  const reason = releaseDefaultsCommand(values, initial).reason;
  const number = (key: keyof ReleaseSettingsValues, label: string, help: string, range: { min: number; max: number; step?: number; required?: boolean }) => (
    <div className="flex min-w-0 flex-col gap-2">
      {E.edit(label, values[key], "number", undefined, { contextualLabels: true, id: `${id}-${key}`, onChange: (value: string) => setValues((current) => ({ ...current, [key]: value })), step: 1, required: true, ...range, "aria-describedby": `${id}-${key}-help` })}
      <FieldDescription id={`${id}-${key}-help`}>{help}</FieldDescription>
    </div>
  );
  return <form noValidate onSubmit={(event) => { event.preventDefault(); if (!busy && !reason) onSave?.(values); }}>
    <FieldSet className="min-w-0" disabled={busy}>
      <FieldLegend><h2 className="font-heading text-xl font-semibold">Releases</h2></FieldLegend>
      <div className="grid gap-4 @min-[24rem]:grid-cols-2">
        {number("openPct", "Open to wholesale (%)", "The share of a planned batch the release form offers by default. The rest covers the taprooms and a short yield.", { min: 1, max: 100 })}
        {number("orderByDays", "Ordering closes (days before ship)", "The order-by date the release form suggests.", { min: 0, max: 60 })}
        {number("capLiftDays", "Customer limits lift (days before ship)", "Until then a customer with a release share can order only up to it. After, what is left is open to everyone.", { min: 0, max: 90 })}
        <div className="flex min-w-0 flex-col gap-2">
          {E.pick("Weekly digest", values.digestDay, [{ value: "", label: "Off" }, ...DIGEST_DAYS.map((label, index) => ({ value: String(index), label }))], { onChange: (digestDay: string) => setValues((current) => ({ ...current, digestDay })) })}
          <FieldDescription>One email a week to the portal users of each customer: new releases, limits about to lift, and beer open to everyone. Off sends nothing.</FieldDescription>
        </div>
        {number("shareWindowDays", "Calculate limits from purchases (days)", "Leave blank to use only the release share typed on each customer. With a number, a customer without a typed share is limited to their part of everyone's purchases over that many days.", { min: 7, max: 730, required: false })}
        {number("stockMultiplier", "Stock purchases count (times)", "How much more a barrel bought from stock counts toward a calculated limit than a pre-ordered one.", { min: 1, max: 10, step: 0.01 })}
        {number("maxSharePct", "Largest calculated limit (%)", "A calculated limit never goes above this. A share typed on a customer can.", { min: 1, max: 100 })}
      </div>
      <CommandFormMessage error={error} />
      <CommandFormFooter className="@min-[24rem]:flex-row @min-[24rem]:items-center @min-[24rem]:justify-end">{E.submit("Save releases", { submitting: busy, reason })}</CommandFormFooter>
    </FieldSet>
    {shares.length ? <section aria-label="Customer limits" className="mt-4 flex flex-col gap-1">
      {E.group("Customer limits")}
      {shares.map((row) => <Fragment key={row.customer_id}>{E.row(row.customer_name, releaseShareLine(row))}</Fragment>)}
    </section> : null}
  </form>;
}
