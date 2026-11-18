// components/mgr/views/branded-name.tsx — a SKU's name as Order and Finished
// goods draw it: brand and format, with the brand's staff alias muted on its
// own line under them (aliasParts, lib/mgr/brand-lines.ts); a SKU whose brand
// has no alias reads as its plain name.
import type { AliasParts } from "@/lib/mgr/brand-lines";

export function BrandedName({ name, aliased }: { name: string; aliased?: AliasParts }) {
  if (!aliased) return <>{name}</>;
  // Its own column, so the alias stacks under the name even inside a flex row (a register link is inline-flex).
  return <span className="flex flex-col"><span>{aliased.brand} · {aliased.format}</span><span className="text-xs font-normal text-muted-foreground">{aliased.alias}</span></span>;
}
