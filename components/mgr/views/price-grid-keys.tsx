"use client";
// components/mgr/views/price-grid-keys.tsx — the box around the Price groups
// table that makes its fields move like a spreadsheet: an arrow key focuses
// the next price field in that direction. A client file of its own because
// PriceGroupsView is drawn on the server and cannot hold a key handler.
import type { ComponentProps } from "react";
import { stepCell } from "@/lib/mgr/price-groups-view";

/** A div whose table moves focus between its fields on the arrow keys. */
export function ArrowKeyGrid(props: ComponentProps<"div">) {
  return (
    <div {...props} onKeyDown={(event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      // Left and right still move the caret inside a price; they leave the
      // field only from its edge (or when the whole price is selected).
      if (event.key === "ArrowLeft" && input.selectionStart !== 0) return;
      if (event.key === "ArrowRight" && input.selectionEnd !== input.value.length) return;
      // One entry per cell: its field, or null when it has none or is hidden (a folded column).
      const grid = [...event.currentTarget.querySelectorAll("tbody tr")].map((tr) =>
        [...tr.children].map((td) => {
          const field = td.querySelector("input");
          return field?.offsetParent ? field : null;
        }));
      // A field outside the table (a sheet opened from the grid) is not in the grid: row is -1.
      const row = grid.findIndex((cells) => cells.includes(input));
      if (row < 0) return;
      const to = stepCell(grid.map((cells) => cells.map(Boolean)), row, grid[row]!.indexOf(input), event.key);
      if (!to) return;
      event.preventDefault();
      const next = grid[to[0]]![to[1]]!;
      next.focus();
      next.select();
    }} />
  );
}
