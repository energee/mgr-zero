import { TabBar } from "@/components/mgr/qty";
// components/mgr/views/price-groups.tsx — Price groups grid, drawn once for
// both surfaces: one tab per sale channel over that channel's table. Every
// cell is an inline dollars field (PriceCellInput); emptying a priced one
// clears it. A pour column on a group without that pour shows the add-pour
// trigger instead. Inventory draws the
// fields inert and E.link for the group; live hands in GroupForm,
// PriceCellForm and PourForm through the renderGroup / renderCell /
// renderAddPour slots and keeps the same table around them.
// The one table is drawn two ways by CSS, so each cell mounts once: a grid
// from md up, and on a phone one block per group with a line per format.
// Formats the channel does not price stay in the table, hidden until the
// switch above it is on.
import { useId, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { LinkTabs } from "@/components/mgr/work-tabs";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { plural } from "@/lib/mgr/plural";
import type { PriceGroupsChannelView, PriceGroupsRowView, PriceGroupsViewModel } from "@/lib/mgr/price-groups-view";
import { cn } from "@/lib/utils";

// A phone cell is one line: the format's name, then its field. The page-bleed
// rule pads a row's outer cells, so the reset is important.
const LINE = "max-md:items-center max-md:justify-between max-md:gap-3 max-md:border-0 max-md:px-0! max-md:py-1";
// A folded column shows only while the grid's switch is on (E.sw is the one switch inside it).
const FOLDED = "hidden group-has-[[role=switch][data-state=checked]]/grid:max-md:flex group-has-[[role=switch][data-state=checked]]/grid:md:table-cell";

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
      {/* Saving… and Saved sit beside the field, so the row keeps its height. */}
      <div className="flex items-center gap-2">
        {!error && status ? <p id={feedbackId} role="status" className="text-xs text-muted-foreground">{status}</p> : null}
        {/* data-quiet-field: no fill until its row is pointed at or focused (app/globals.css). */}
        <InputGroup data-quiet-field className="w-28">
          <InputGroupAddon>$</InputGroupAddon>
          <InputGroupInput aria-label={label} inputMode="decimal" placeholder="—" autoComplete="off" disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error || status ? feedbackId : undefined}
            className="text-right tabular-nums"
            onBlur={onCommit ? () => void onCommit() : undefined}
            {...(onChange ? { value, onChange: (event) => onChange(event.target.value) } : { defaultValue: value })} />
        </InputGroup>
      </div>
      {error ? <p id={feedbackId} role="alert" className="max-w-40 whitespace-normal text-right text-xs text-destructive">{error}</p> : null}
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
  const foldedCount = channel?.folded.filter(Boolean).length ?? 0;
  const showLabel = channel && foldedCount > 0 ? `Show ${plural(foldedCount, "format")} not priced on ${channel.name}` : null;
  // The last column showing while the rest are folded: the row's edge then (app/globals.css).
  const edge = channel?.folded.lastIndexOf(false);
  return (
    <>
      {E.back("More", "Price groups", createAction !== undefined ? createAction : E.btn("New price group"), backHref)}
      {E.info("Price groups down, formats across. A beer sits on one group and a customer on one channel; the cell where they meet is the price.")}
      {model.groupCount === 0 ? E.blank("Add a price group, then put each brand on one from Catalog.")
        : !channel ? E.blank("No sale channels yet")
        : <div data-price-grid className="group/grid flex shrink-0 flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {model.tabHrefs
              ? <LinkTabs items={model.tabHrefs} current={channel.name} className="w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] md:w-fit" />
              : <TabBar names={model.tabs} on={model.tab} cls="w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] md:w-fit" />}
            {showLabel && <label className="flex items-center gap-2 text-sm text-muted-foreground">{E.sw(false, showLabel)}{showLabel}</label>}
          </div>
          {/* Unsorted: the cells are price editors, and the rows are the price groups in their saved order. */}
          <Table className="max-md:block md:min-w-max">
            <TableHeader className="max-md:hidden">
              <TableRow>
                <TableHead>Group</TableHead>
                {model.headers.map((header, col) => <TableHead key={col} className={cn("text-right", channel.folded[col] && FOLDED)} data-row-edge={col === edge || undefined}>{header}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody className="max-md:block">
              {channel.rows.map((row) => (
                <TableRow key={row.id} className="max-md:block max-md:py-2">
                  <TableCell className="text-left max-md:block max-md:border-0 max-md:px-0! max-md:py-1">
                    {renderGroup(row)}
                    <p className="text-muted-foreground max-md:inline max-md:pl-2">{row.note}</p>
                  </TableCell>
                  {row.cells.map((value, col) => (
                    <TableCell key={col} className={cn("text-right", LINE, channel.folded[col] ? FOLDED : "max-md:flex")} data-row-edge={col === edge || undefined}>
                      <span className="text-muted-foreground md:hidden">{model.headers[col]}</span>
                      {row.formatIds[col] ? renderCell(channel, row, col, value) : renderAddPour(row, model.formats[col]!)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>}
    </>
  );
}
