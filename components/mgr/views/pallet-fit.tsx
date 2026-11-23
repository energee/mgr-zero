// components/mgr/views/pallet-fit.tsx — the advisory Layers block: per
// package group, how full each layer is, as text and a segmented bar
// (one segment per layer, the last filled to its share). The portal order
// summary, Review order and the staff Order page draw it from palletFit
// (lib/mgr/pallet-fit.ts). Nothing here warns or blocks.
import type { PalletFitGroup } from "@/lib/mgr/pallet-fit";

/** More units than this read from the text alone; the bar would be hairlines. */
const MAX_SEGMENTS = 12;

export function PalletFitBlock({ groups }: { groups: PalletFitGroup[] }) {
  if (!groups.length) return null;
  return (
    <section aria-label="Layers" className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">Layers</h2>
      <ul className="flex flex-col gap-2.5">
        {groups.map((group) => {
          const units = group.full + (group.remainder ? 1 : 0);
          return (
            <li key={group.key} className="flex flex-col gap-1 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span>{group.label}</span>
                <span className="text-right tabular-nums text-muted-foreground">{group.text}</span>
              </div>
              {units <= MAX_SEGMENTS ? (
                <div aria-hidden className="flex gap-1">
                  {Array.from({ length: units }, (_, index) => {
                    const share = index < group.full ? 100 : (group.remainder / group.fit) * 100;
                    return <div key={index} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} /></div>;
                  })}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">How many fill a layer, as the brewery loads. A guide only.</p>
    </section>
  );
}
