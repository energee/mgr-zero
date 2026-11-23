// components/mgr/views/branded-name.tsx — a line's name with the brand's alias
// muted on its own line under it (lineLabel, lib/mgr/brand-lines.ts). Staff
// order screens and the portal draw names this way; no alias reads as the name.
export function BrandedName({ name, alias }: { name: string; alias?: string }) {
  // Its own column, so the alias stacks under the name even inside a flex row (a register link is inline-flex).
  return alias ? <span className="flex flex-col"><span>{name}</span><span className="text-xs font-normal text-muted-foreground">{alias}</span></span> : <>{name}</>;
}
