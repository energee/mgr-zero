// components/mgr/views/entry.tsx — Sign in / reset / set-password inventory
// drawings. Live LoginForm / Entry cards stay wrappers.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { EntryViewModel } from "@/lib/mgr/entry-view";

export type { EntryViewModel };

export function EntryView({
  model,
  body,
}: {
  model: EntryViewModel;
  body?: ReactNode;
}) {
  return (
    <>
      {E.sp()}
      {E.ttl(model.title)}
      {body ?? (
        <>
          {model.note ? E.note(model.note) : null}
          {model.field ? E.fld(model.field.label, model.field.value) : null}
          {model.inputs.map((label) => <FragmentInp key={label} label={label} />)}
          {E.btn(model.primary)}
          {model.secondary ? E.btn(model.secondary, "g") : null}
          {model.extraPrimary ? E.btn(model.extraPrimary, "g") : null}
          {model.link ? E.link(model.link.label, model.link.to) : null}
          {model.info ? E.info(model.info) : null}
        </>
      )}
      {E.sp()}
    </>
  );
}

function FragmentInp({ label }: { label: string }) {
  return E.inp(label);
}
