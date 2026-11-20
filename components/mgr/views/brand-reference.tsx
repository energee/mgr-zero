// components/mgr/views/brand-reference.tsx — the body of the portal brand
// sheet (toBrandReference, lib/mgr/brand-reference-view.ts), laid out as a
// product page: the label (a slot the live adapter fills with
// ColaLabelImageView) beside the details from md up and above them on a phone.
// The details are one alias · style · ABV line, the description, the hops,
// `order` (on Shop, the brand's package rows, so the buyer orders from the
// sheet; absent on a past order), and the COLA TTB ID as a small registry link.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { cn } from "@/lib/utils";
import type { BrandReferenceModel } from "@/lib/mgr/brand-reference-view";

export function BrandReferenceView({ model, image, order }: { model: BrandReferenceModel; image?: ReactNode; order?: ReactNode }) {
  const lead = [model.alias, model.tagline].filter(Boolean).join(" · ");
  const empty = !image && !lead && !model.hops && !model.description && !model.cola && !order;
  return <div className={cn("flex flex-col gap-4", image && "md:grid md:grid-cols-2 md:items-start")}>
    {image}
    <div className="flex min-w-0 flex-col gap-3">
      {lead ? <p className="text-sm text-muted-foreground">{lead}</p> : null}
      {model.description ? <p className="text-sm">{model.description}</p> : null}
      {model.hops ? E.fld("Hops", model.hops) : null}
      {order}
      {model.cola ? <p className="text-xs text-muted-foreground">Label approval (TTB): {model.cola.href
        ? <a href={model.cola.href} target="_blank" rel="noopener noreferrer" className="underline">{model.cola.ttbId}</a>
        : model.cola.ttbId}</p> : null}
      {empty ? <p className="text-sm text-muted-foreground">No more details from the brewery yet.</p> : null}
    </div>
  </div>;
}
