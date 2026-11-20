// components/mgr/views/brand-heading.tsx — a brand heading as the portal draws
// it on Shop and on an order: an optional label thumbnail, then the brand name
// with its alias directly under it. The text block is centered against the
// thumbnail and, without one, starts flush with the rows below. `card` is
// Shop's form: the label above a larger name. `facts` is the brand's
// style and ABV line under the alias. `onOpen` makes
// the name a button that opens the brand reference sheet (the live adapter,
// app/(portal)/portal/brand-heading.tsx, owns the sheet and the image).
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { cn } from "@/lib/utils";

export function BrandHeading({ name, alias, facts, anchor, thumb, onOpen, card = false }: {
  name: string; alias?: string | null; facts?: string; anchor?: string; thumb?: ReactNode; onOpen?: () => void; card?: boolean;
}) {
  // The row carries E.ttl's top margin, so the heading itself sits flush in the text block.
  return <div data-brand-heading className={cn("flex gap-3", card ? "flex-col" : "mt-2 items-center")}>
    {thumb}
    <div className={cn("flex flex-col [&>h2]:mt-0", "[&>h2]:font-semibold [&>h2]:text-foreground", card && "[&>h2]:text-base")}>
      {E.ttl(onOpen ? <button type="button" onClick={onOpen} className="text-left hover:underline">{name}</button> : name, anchor)}
      {alias ? <p className="text-xs text-muted-foreground">{alias}</p> : null}
      {facts ? <p className="text-xs text-muted-foreground">{facts}</p> : null}
    </div>
  </div>;
}
