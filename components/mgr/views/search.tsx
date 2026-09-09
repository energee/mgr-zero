// components/mgr/views/search.tsx — Search and Entity picker inventory
// palettes. Live SearchPalette stays the wrapper (cmdk is not E.palette).
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { SearchViewModel } from "@/lib/mgr/search-view";

export type { SearchViewModel };

export function SearchView({
  model,
  palette,
}: {
  model: SearchViewModel;
  palette?: ReactNode;
}) {
  return (
    <>
      {model.heading ? E.hd(model.heading, model.sub) : null}
      {palette !== undefined ? palette : E.palette(model.placeholder, model.groups)}
    </>
  );
}
