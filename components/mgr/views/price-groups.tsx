// components/mgr/views/price-groups.tsx — Price groups grid, drawn once for
// both surfaces: one tab per sale channel over that channel's table. Every
// cell is an inline dollars field (PriceCellInput); emptying a priced one
// clears it. A pour column on a group without that pour shows the add-pour
// trigger instead. Inventory draws the
// fields inert and E.link for the group; live hands in GroupForm,
// PriceCellForm and PourForm through the renderGroup / renderCell /
// renderAddPour slots and keeps the same table around them.
import { useId, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { LinkTabs } from "@/components/mgr/work-tabs";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import type { PriceGroupsChannelView, PriceGroupsRowView, PriceGroupsViewModel } from "@/lib/mgr/price-groups-view";

/** One price cell: "$" and a decimal field, "—" when unpriced. Enter or leaving the input commits (live only). */
export function PriceCellInput({ label, value, onChange, onCommit, disabled, error, status }: {
  /** Names the cell for assistive tech: group · format on channel. */
  label: string;
  value: string;
  onChange?: (value: string) => void;
  onCommit?: () => void | Promise<void>;
  disabled?: boolean;
  error?: string | null;
  status?: string | null;
}) {
  const feedbackId = useId();
  return (
    <form className="flex flex-col items-end gap-1" {...(onCommit ? {
      onSubmit: (event) => { event.preventDefault(); event.stopPropagation(); void onCommit(); },
    } : {})}>
      <InputGroup className="w-28">
        <InputGroupAddon>$</InputGroupAddon>
        <InputGroupInput aria-label={label} inputMode="decimal" placeholder="—" autoComplete="off" disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error || status ? feedbackId : undefined}
          className="text-right tabular-nums"
          onBlur={onCommit ? () => void onCommit() : undefined}
          {...(onChange ? { value, onChange: (event) => onChange(event.target.value) } : { defaultValue: value })} />
      </InputGroup>
      {error ? <p id={feedbackId} role="alert" className="max-w-40 whitespace-normal text-right text-xs text-destructive">{error}</p>
        : status ? <p id={feedbackId} role="status" className="max-w-40 whitespace-normal text-right text-xs text-muted-foreground">{status}</p> : null}
    </form>
  );
}

/** A pour column's cell on a group without that pour: opens Add pour with the name filled in. */
export const addPourTrigger = (pour: string, group: string) => (
  <Button variant="ghost" size="sm" className="text-muted-foreground">+ add<span className="sr-only"> {pour} pour to {group}</span></Button>
);

export function PriceGroupsView({
  model,
  createAction,
  renderGroup = (row) => E.link(row.name, "Price group"),
  renderCell = (channel, row, col, value) => <PriceCellInput label={`${row.name} · ${model.formats[col]} on ${channel.name}`} value={value ?? ""} />,
  renderAddPour = (row, pour) => addPourTrigger(pour, row.name),
  backHref,
}: {
  model: PriceGroupsViewModel;
  createAction?: ReactNode;
  /** The row's first cell: the group's name, opening the group. */
  renderGroup?: (row: PriceGroupsRowView) => ReactNode;
  /** One price cell on the showing channel; `value` is the dollars text, or null when unpriced. */
  renderCell?: (channel: PriceGroupsChannelView, row: PriceGroupsRowView, col: number, value: string | null) => ReactNode;
  /** A pour column's cell on a group that has no pour of that name. */
  renderAddPour?: (row: PriceGroupsRowView, pour: string) => ReactNode;
  backHref?: string;
}) {
  const channel = model.channel;
  return (
    <>
      {E.back("More", "Price groups", createAction !== undefined ? createAction : E.btn("New price group"), backHref)}
      {E.info("Price groups down, formats across. A beer sits on one group and a customer on one channel; the cell where they meet is the price.")}
      {model.groupCount === 0 ? E.blank("Add a price group, then put each brand on one from Catalog.")
        : !channel ? E.blank("No sale channels yet")
        : <>
          {model.tabHrefs
            ? <LinkTabs items={model.tabHrefs} current={channel.name} className="w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] md:w-fit" />
            : E.tabs(model.tabs, model.tab, "w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] md:w-fit")}
          <div className="min-w-0 shrink-0 overflow-x-auto">
            {E.tbl(
              ["Group", ...model.headers],
              channel.rows.map((row) => [
                renderGroup(row),
                ...row.cells.map((value, col) => row.formatIds[col] ? renderCell(channel, row, col, value) : renderAddPour(row, model.formats[col]!)),
              ]),
              ["l", ...model.formats.map(() => "r" as const)],
              // Unsorted: the cells are price editors, and the rows are the
              // price groups in their saved order.
              { sortable: false },
            )}
          </div>
        </>}
    </>
  );
}
