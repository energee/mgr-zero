// components/mgr/e.tsx — the screen vocabulary, ported name-for-name from the
// wireframe file's `E` helper (.agents/superpowers/specs/2026-08-31-mgr-wireframes.html,
// deleted in #133 once ported) but styled as shadcn defaults: quiet surfaces, one accent,
// color only where it carries meaning (a status dot, not a filled row).
// Target sizing under a coarse pointer lives in app/globals.css, so nothing
// here sets heights. Screen authors use only these and never components/ui.
import * as React from "react";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { Alert02Icon, ArrowLeft01Icon, InformationCircleIcon, SquareLock01Icon } from "@hugeicons/core-free-icons";
import { DatePicker } from "@/components/mgr/date-picker";
import { DirectionIcon, Icon, type IconSvgElement } from "@/components/mgr/icon";
import { TimeWindowField } from "@/components/mgr/time-window-field";
import { VolumeField } from "@/components/mgr/volume-field";
import { MARIA, UserAvatar } from "@/components/mgr/user-avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Empty, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupTextarea } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

/** Row modifiers from the wireframe: w = needs attention, ok = current, dis = gated. */
type RowClass = "" | "w" | "ok" | "dis";
const dotColor: Partial<Record<RowClass, string>> = { w: "bg-warning-foreground", ok: "bg-primary" };
const Dot = ({ cls }: { cls: RowClass }) => (dotColor[cls] ? <span className={cn("size-2 rounded-full", dotColor[cls])} /> : null);
const TileContent = ({ n, s, g, w, f }: { n: React.ReactNode; s: React.ReactNode; g?: React.ReactNode; w?: 0 | 1; f?: number }) => (<>
  <span className="flex items-center gap-1.5 font-medium text-sm leading-none">{w ? <Dot cls="w" /> : null}{n}</span>
  <span className="text-muted-foreground text-sm leading-normal">{s}</span>
  {g ? <span className="text-muted-foreground text-sm leading-normal">{g}</span> : null}
  {f != null && <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-muted"><i className="block h-full bg-primary" style={{ width: `${f}%` }} /></span>}
</>);

/** ItemMedia rides with the title line whenever a row has a description, which is
 *  right for a 16px icon and wrong for a face: the tallest thing in the row centres. */
const FACE_MEDIA = "group-has-data-[slot=item-description]/item:translate-y-0 group-has-data-[slot=item-description]/item:self-center";
/** Button kinds: p = primary, g = secondary/outline, ghost = quiet, irr = irreversible
 *  but still a record (teal), del = takes something away (red); " disabled" suffix draws a gated action.
 *  Teal is for a write you meant to make; red is for a loss: ending a membership,
 *  cancelling an order, breaking an integration, discarding queued work, kicking a keg. */
type BtnBase = "p" | "g" | "ghost" | "irr" | "del";
type BtnKind = BtnBase | `${BtnBase} disabled`;
type VolumeUnit = "oz" | "gal" | "bbl" | "mL" | "L";

export const E = {
  hd: (t: React.ReactNode, r: React.ReactNode = "") => (
    <div className="flex items-baseline justify-between gap-2">
      <h1 className="text-lg font-semibold">{t}</h1>
      <span className="text-xs text-muted-foreground">{r}</span>
    </div>
  ),
  /** A detail screen's header: an arrow link to the parent area above the title. */
  back: (to: React.ReactNode, title: React.ReactNode) => (
    <div className="flex flex-col gap-1">
      <a href="#" className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Icon icon={ArrowLeft01Icon} />{to}</a>
      <h1 className="text-lg font-semibold">{title}</h1>
    </div>
  ),
  ttl: (t: React.ReactNode) => <h2 className="mt-2 text-sm font-medium text-muted-foreground">{t}</h2>,
  /** `icon` says which kind of thing a row is — only in lists that mix kinds
   * (Today, search); a homogeneous list gets none (docs/plans/hugeicons.md §3). */
  row: (t: React.ReactNode, s: React.ReactNode = "", n: React.ReactNode = "", cls: RowClass = "", icon?: IconSvgElement | React.ReactElement) => (
    <Item variant="outline" className={cn(cls === "dis" && "opacity-50")}>
      {(icon || dotColor[cls]) && (
        <ItemMedia className={cn(isValidElement(icon) && FACE_MEDIA)}>
          {/* A Hugeicons icon is an array; an element is already media (E.face). */}
          {icon ? (isValidElement(icon) ? icon : <Icon icon={icon} />) : <Dot cls={cls} />}
        </ItemMedia>
      )}
      <ItemContent>
        <ItemTitle>{icon && dotColor[cls] ? <><Dot cls={cls} />{t}</> : t}</ItemTitle>
        {s ? <ItemDescription>{s}</ItemDescription> : null}
      </ItemContent>
      {n ? <ItemActions>{typeof n === "string" ? <span className="text-sm text-muted-foreground">{n}</span> : n}</ItemActions> : null}
    </Item>
  ),
  /** A row's trailing action verb (Pick, Confirm, Resume) as a real target. */
  act: (t: React.ReactNode) => <Button variant="ghost" size="sm" data-row-action>{t}</Button>,
  /** A status word. Never clickable. */
  status: (t: React.ReactNode, tone: "ok" | "w" | "" = "") => (
    <Badge variant={tone === "w" ? "secondary" : "outline"} className="gap-1.5">
      {tone === "ok" ? <Dot cls="ok" /> : null}{t}
    </Badge>
  ),
  /** An on/off setting. */
  sw: (on: boolean, label: string) => <Switch defaultChecked={on} aria-label={label} />,
  btn: (t: React.ReactNode, k: BtnKind = "p") => {
    const [kind, disabled] = k.split(" ") as [BtnBase, string?];
    return (
      <Button
        variant={kind === "g" ? "outline" : kind === "ghost" ? "ghost" : kind === "del" ? "destructive" : "default"}
        disabled={Boolean(disabled)}
        className={cn(
          kind === "irr" && "bg-irreversible text-irreversible-foreground hover:bg-irreversible/90",
          // Solid, not shadcn's tint (whose dark:bg-destructive/20 would otherwise
          // win): a loss should carry the same weight as the teal commit beside it.
          kind === "del" && "bg-destructive text-destructive-foreground hover:bg-destructive/90 dark:bg-destructive dark:hover:bg-destructive/90",
        )}
        {...(kind === "irr" ? { "data-variant": "irreversible" } : {})}
      >
        {t}
      </Button>
    );
  },
  btns: (arr: (React.ReactNode | [React.ReactNode, BtnKind])[], c: "c2" | "c3" = "c2") => (
    <div className={cn("grid gap-2 md:flex md:flex-wrap md:justify-end", c === "c3" ? "grid-cols-3" : "grid-cols-2")}>
      {arr.map((v, i) => (
        <React.Fragment key={i}>{Array.isArray(v) ? E.btn(v[0], v[1]) : E.btn(v)}</React.Fragment>
      ))}
    </div>
  ),
  num: (v: React.ReactNode, s: React.ReactNode) => (
    <div>
      <div className="text-2xl font-semibold">{v}</div>
      <div className="text-xs text-muted-foreground">{s}</div>
    </div>
  ),
  /** A person's photo, for a row's media slot: E.row(name, sub, "", "", E.face()).
   *  Defaults to Maria; a fixture is anyone else (E.face({ src: "/mock/dave.jpg" })),
   *  and a name with no fixture draws initials (E.face({ name: "Sam Ruiz" })). */
  face: ({ src, name, className }: { src?: string; name?: string; className?: string } = {}) => (
    // A name with no fixture draws initials; neither one is the signed-in user.
    <UserAvatar src={src ?? (name ? undefined : MARIA)} name={name} className={className} />
  ),
  /** A forward arrow read as "to"; null draws it decorative (aria-hidden). */
  arrow: (label: string | null = "to") => <DirectionIcon label={label} />,
  /** A typed quantity: the OS keyboard is the keypad. unit renders as a trailing addon. */
  qty: (value: string, unit?: React.ReactNode, label = "Quantity", id?: string) => (
    <InputGroup>
      <InputGroupInput id={id} type="number" inputMode="decimal" step="any" defaultValue={value} aria-label={label} className="text-2xl font-semibold" />
      {unit ? <InputGroupAddon align="inline-end">{unit}</InputGroupAddon> : null}
    </InputGroup>
  ),
  /** A view switcher: the body below is the active panel, so there are no
   *  TabsContent panels here. A filter that swaps the whole list (Work's kinds,
   *  an order's states) is a tab bar too; single-choice fields stay chips.
   *  Spans the column by default; pass width classes to hug ("w-fit", an input
   *  addon) or to scroll a bar too long for the phone ("overflow-x-auto"). */
  tabs: (names: string[], on = 0, cls = "w-full") => (
    // Uncontrolled, like chips: a controlled value with no onValueChange makes
    // every trigger inert, and these bars are meant to be clickable in the inventory.
    <Tabs defaultValue={names[on]}>
      <TabsList variant="solid" className={cls}>{names.map((n) => <TabsTrigger key={n} value={n}>{n}</TabsTrigger>)}</TabsList>
    </Tabs>
  ),
  chips: (arr: string[], on = 0, bright = false) => (
    <ToggleGroup type="single" defaultValue={arr[on]} variant="outline" size="sm" className="flex-wrap justify-start">
      {arr.map((c) => (
        <ToggleGroupItem key={c} value={c} className={cn(bright && "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground")}>{c}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  ),
  /** An atomic format's volume: a qty whose unit addon is the per-instance unit choice. */
  volume: (value: string, units: VolumeUnit[], on = 0) => <VolumeField value={value} units={units} on={on} />,
  /** Commit; CommandForm lifts this out of the scroll region so the verb stays on the phone. */
  pin: (t: React.ReactNode) => (
    <div data-pin className="flex flex-col gap-2">
      {t}
    </div>
  ),
  tape: (arr: [React.ReactNode, React.ReactNode?][]) => (
    <ol className="ml-1 flex flex-col gap-1 border-l-2 pl-3 font-mono text-xs text-muted-foreground">
      {arr.map(([a, b], i) => (
        <li key={i} className="flex justify-between gap-2 [overflow-wrap:anywhere]">
          <span className="text-foreground">{a}</span>
          <span>{b ?? ""}</span>
        </li>
      ))}
    </ol>
  ),
  /** A read-only pair, as a definition list: the label names the value for a
   *  screen reader, which a pair of spans does not. Not Item — that is a row
   *  with its own border and inset, and these sit flush inside one. */
  fld: (k: React.ReactNode, v: React.ReactNode) => (
    <dl className="flex items-center justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right">{v}</dd>
    </dl>
  ),
  /** A text link. `to` names the destination screen when the copy does not
   *  (tests/mgr-screens.test.ts resolves every link to a screen or shell area). */
  link: (t: React.ReactNode, to?: string) => (
    <a href="#" data-to={to} className="text-sm text-muted-foreground underline">{t}</a>
  ),
  /** An editable field. type is the native input type; "date" pops the calendar (DatePicker). */
  edit: (label: string, value: string, type: React.HTMLInputTypeAttribute = "text", suggestions?: string[]) => {
    if (type === "date") return <DatePicker label={label} defaultValue={value} />;
    // A whole number (a contract quantity, an overdue threshold) is counted,
    // not typed: the same −/+ stepper Weekly count uses.
    if (type === "number") {
      return (
        <Field orientation="horizontal">
          <FieldLabel>{label}</FieldLabel>
          {E.stq(Number(value), label)}
        </Field>
      );
    }
    const listId = suggestions?.length ? `${label.replace(/\s+/g, "-").toLowerCase()}-list` : undefined;
    return (
      <Field orientation="horizontal">
        <FieldLabel>{label}</FieldLabel>
        <Input type={type} defaultValue={value} aria-label={label} list={listId} />
        {listId ? <datalist id={listId}>{suggestions!.map((o) => <option key={o} value={o} />)}</datalist> : null}
      </Field>
    );
  },
  /** A time-of-day window as one two-thumb range: start and end are 24-hour "hh:mm". */
  window: (label: string, start: string, end: string) => <TimeWindowField label={label} start={start} end={end} />,
  /** A picked value: a Select for short fixed lists; long lists (SKU, customer) keep opening Entity picker. */
  pick: (label: string, value: string, options: string[]) => (
    <Field orientation="horizontal">
      <FieldLabel>{label}</FieldLabel>
      <Select defaultValue={value}>
        <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
  ),
  // The amber box and the quiet box differed only by tint; the glyph is the
  // second channel, so the difference survives a dim screen or a colorblind eye.
  note: (t: React.ReactNode) => (
    // A warm card, sitting at the same lift off the page as a plain Alert's
    // bg-card, so attention is carried by the amber ink and rule rather than by
    // a filled panel competing with the row beside it.
    <Alert className="border-warning-foreground/40 bg-warning text-warning-foreground">
      <Icon icon={Alert02Icon} />
      {/* text-pretty, not shadcn's text-balance: balancing shortens every line to
          even them up, so a two-line note reads as a narrow block in a wide card. */}
      <AlertDescription className="text-pretty text-warning-foreground">{t}</AlertDescription>
    </Alert>
  ),
  info: (t: React.ReactNode) => (
    <Alert>
      <Icon icon={InformationCircleIcon} />
      <AlertDescription className="text-pretty">{t}</AlertDescription>
    </Alert>
  ),
  /** Annotation chips; the gallery renders this under the frame, never inside it. */
  states: (arr: [string, string, (0 | 1)?][]) => (
    <dl className="flex flex-wrap gap-1.5">
      {arr.map(([a, b, w]) => (
        <Badge key={a} variant={w ? "secondary" : "outline"} className="font-normal">
          <dt className="font-medium">{a}</dt>
          <dd className="text-muted-foreground">{b}</dd>
        </Badge>
      ))}
    </dl>
  ),
  stp: (arr: string[], cur: number) => (
    <div className="flex items-center gap-1 text-xs">
      {arr.map((s, i) => (
        <React.Fragment key={s}>
          <Badge variant={i === cur ? "default" : "outline"}>{s}</Badge>
          {i < arr.length - 1 && <Separator className={cn("flex-1", i < cur && "bg-primary")} />}
        </React.Fragment>
      ))}
    </div>
  ),
  tiles: (arr: [React.ReactNode, React.ReactNode, React.ReactNode?, (0 | 1)?, number?][], c: "c2" | "c3" = "c3") => (
    <ItemGroup className={cn("grid gap-2", c === "c2" ? "grid-cols-2" : "grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]")}>
      {arr.map(([n, s, g, w, f], i) => (
        <Item key={i} variant="outline" size="sm" className="flex-col items-start gap-0.5" asChild>
          <button type="button"><TileContent {...{ n, s, g, w, f }} /></button>
        </Item>
      ))}
    </ItemGroup>
  ),
  tbl: (hd: React.ReactNode[], rows: React.ReactNode[][]) => (
    <Table className="min-w-max">
      <TableHeader>
        <TableRow>
          {hd.map((h, i) => (
            <TableHead key={i} className={cn(i && "text-right")}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            {r.map((c, j) => (
              <TableCell key={j} className={cn(j && "text-right")}>{c}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
  blank: (t: React.ReactNode, icon?: IconSvgElement) => (
    <Empty className="flex-1">
      {icon && <EmptyMedia variant="icon"><Icon icon={icon} size={20} /></EmptyMedia>}
      <EmptyDescription>{t}</EmptyDescription>
    </Empty>
  ),
  inp: (t: string) => <Input placeholder={t} aria-label={t} />,
  stq: (v: number, label = "Quantity") => (
    <ButtonGroup>
      <Button variant="outline" size="icon" aria-label="Decrease">−</Button>
      <Input type="number" inputMode="numeric" min={0} defaultValue={v} aria-label={label} className="w-14 appearance-none text-center [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
      <Button variant="outline" size="icon" aria-label="Increase">+</Button>
    </ButtonGroup>
  ),
  gated: (t: React.ReactNode, why: React.ReactNode = "isn’t available yet") => E.row(t, why, "", "dis", SquareLock01Icon),
  nav: (t: React.ReactNode, s: React.ReactNode = "", cls: RowClass = "", icon?: IconSvgElement | React.ReactElement) => E.row(t, s, <DirectionIcon label="Open" />, cls, icon),
  sp: () => <div className="flex-1" />,
  comp: (portal = false) => (
    <InputGroup>
      <InputGroupTextarea rows={1} placeholder={portal ? "Ask about this account or repeat an order…" : "Say what happened…"} />
      <InputGroupAddon align="inline-end">
        <Button variant="ghost" size="sm">History</Button>
      </InputGroupAddon>
    </InputGroup>
  ),
};

function isPin(n: ReactNode) {
  return isValidElement(n) && Boolean((n.props as { "data-pin"?: unknown })["data-pin"]);
}

/** Lift `E.pin` out of a fragment body so CommandForm can keep it on screen. */
export function splitPinned(body: ReactNode) {
  const raw = isValidElement(body) && body.type === Fragment
    ? (body.props as { children?: ReactNode }).children
    : body;
  const rest: ReactNode[] = [];
  const pin: ReactNode[] = [];
  for (const n of Children.toArray(raw)) (isPin(n) ? pin : rest).push(n);
  return { rest, pin };
}
