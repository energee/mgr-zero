// components/mgr/views/brand-reference.tsx — the body of the portal brand
// reference sheet (toBrandReference, lib/mgr/brand-reference-view.ts): the
// label image (a slot the live adapter fills with ColaLabelImageView), alias,
// style, ABV, hops, description, and the COLA TTB ID linked to TTB's registry.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { BrandReferenceModel } from "@/lib/mgr/brand-reference-view";

export function BrandReferenceView({ model, image }: { model: BrandReferenceModel; image?: ReactNode }) {
  const empty = !image && !model.facts.length && !model.description && !model.cola;
  return <div className="flex flex-col gap-2">
    {image}
    {model.alias ? <p className="text-sm text-muted-foreground">{model.alias}</p> : null}
    {model.facts.map((fact) => <Fragment key={fact.label}>{E.fld(fact.label, fact.value)}</Fragment>)}
    {model.description ? <p className="text-sm">{model.description}</p> : null}
    {model.cola ? E.fld("COLA TTB ID", model.cola.href
      ? <a href={model.cola.href} target="_blank" rel="noopener noreferrer" className="underline">{model.cola.ttbId}</a>
      : model.cola.ttbId) : null}
    {empty ? <p className="text-sm text-muted-foreground">No more details from the brewery yet.</p> : null}
  </div>;
}
