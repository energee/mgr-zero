// components/mgr/views/brand-heading.tsx — a brand heading as the portal draws
// it on Shop and on an order: an optional label thumbnail, then the brand name
// with its alias directly under it. The text block is centered against the
// thumbnail and, without one, starts flush with the rows below. `onOpen` makes
// the name a button that opens the brand reference sheet (the live adapter,
// app/(portal)/portal/brand-heading.tsx, owns the sheet and the image).
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";

export function BrandHeading({ name, alias, anchor, thumb, onOpen }: {
  name: string; alias?: string | null; anchor?: string; thumb?: ReactNode; onOpen?: () => void;
}) {
  // The row carries E.ttl's top margin, so the heading itself sits flush in the text block.
  return <div data-brand-heading className="mt-2 flex items-center gap-3">
    {thumb}
    <div className="flex flex-col [&>h2]:mt-0">
      {E.ttl(onOpen ? <button type="button" onClick={onOpen} className="text-left hover:underline">{name}</button> : name, anchor)}
      {alias ? <p className="text-xs text-muted-foreground">{alias}</p> : null}
    </div>
  </div>;
}
