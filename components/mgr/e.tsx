// components/mgr/e.tsx — the screen vocabulary, ported name-for-name from the
// wireframe file's `E` helper (.agents/superpowers/specs/2026-08-31-mgr-wireframes.html,
// deleted in #133 once ported) but styled as shadcn defaults: quiet surfaces, one accent,
// color only where it carries meaning (a status dot, not a filled row).
// Target sizing under a coarse pointer lives in app/globals.css, so nothing
// here sets heights. Views import shadcn parts from @/components/ui directly.
// E holds only MGR vocabulary that adds behavior or domain meaning to them:
// status tones, quantity and volume fields, searchPick, the irr/del button
// kinds. Never add an E helper that only wraps a single shadcn part, and
// retire an existing one when its callers are next touched (#909).
import { DatePicker } from "@/components/mgr/date-picker";
import { DirectionIcon, Icon, type IconSvgElement } from "@/components/mgr/icon";
import { Palette, type PaletteGroup } from "@/components/mgr/palette";
import { Qty, StepQuantity, TabBar } from "@/components/mgr/qty";
import { SearchPick, type SearchPickOption } from "@/components/mgr/search-pick";
import { SortTable } from "@/components/mgr/sort-table";
import { SubmitButton, type SubmitButtonProps } from "@/components/mgr/submit-button";
import { TimeWindowField } from "@/components/mgr/time-window-field";
import { MARIA, UserAvatar } from "@/components/mgr/user-avatar";
import { ComposerDemo } from "@/components/mgr/composer-demo";
import { VolumeField } from "@/components/mgr/volume-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { StaffRole } from "@/lib/commands/registry";
import type { EmptyState } from "@/lib/mgr/empty-state";
import { rowLinkPrefetch } from "@/lib/mgr/row-link-prefetch";
import { cn } from "@/lib/utils";
import { Alert02Icon, ArrowLeft01Icon, InformationCircleIcon, SquareLock01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import * as React from "react";
import { Children, Fragment, isValidElement, type ReactNode } from "react";

/** Selected outline toggle painted with the primary pair instead of the faint
 *  bg-muted wash, for choices that must read at a glance (Location Uses, #493).
 *  E.chips takes it as `bright`; components/ui/toggle.tsx stays stock shadcn. */
export const BRIGHT_ON = "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground";

/** Row modifiers from the wireframe: w = needs attention, ok = current, dis = gated. */
type RowClass = "" | "w" | "ok" | "dis";
/** --dot-warning / --dot-success in app/globals.css say why these are not the
 *  warning/success inks. */
const dotColor: Partial<Record<RowClass, string>> = { w: "bg-dot-warning", ok: "bg-dot-success" };
/** What the dot means, said out loud: colour alone is not a status (WCAG 1.4.1). */
const dotLabel: Partial<Record<RowClass, string>> = { w: "Needs attention", ok: "Current" };
/** 10px with a background-coloured ring, so the dot still reads as a dot on a
 *  tinted row or over the corner of a row icon. */
const Dot = ({ cls, className }: { cls: RowClass; className?: string }) => (dotColor[cls] ? (
  <span className={cn("size-2.5 shrink-0 rounded-full ring-2 ring-background", dotColor[cls], className)} role="img" aria-label={dotLabel[cls]} />
) : null);
/** A row's leading mark. A Hugeicons icon is an array; an element is already
 *  media (E.face). With an icon the status rides its corner rather than the
 *  title line — a dot before the title indents the title away from its
 *  description — and the positioning wrapper costs a node only when there is
 *  a dot to hang. */
const RowMedia = ({ icon, cls }: { icon: IconSvgElement | React.ReactElement; cls: RowClass }) => {
  const glyph = isValidElement(icon) ? icon : <Icon icon={icon} size={24} />;
  return dotColor[cls] ? (
    <span className="relative">{glyph}<Dot cls={cls} className="-top-1 -right-1 absolute" /></span>
  ) : glyph;
};
/** A vessel tile's text and fill bar. `f` is percent full: the bar says a whole
 *  percent and stays in the progress range, because a tank recorded outside its
 *  capacity (before #488) still shows its real bbl in `s`. Stock shadcn Progress
 *  spends `value` on the bar's width only, so aria-valuenow carries the same
 *  bounded number to a reader. */
const TileContent = ({ n, s, g, w, f }: { n: React.ReactNode; s: React.ReactNode; g?: React.ReactNode; w?: 0 | 1; f?: number }) => {
  const full = f == null ? undefined : Math.round(Math.max(0, Math.min(f, 100)));
  return (<>
    <span className="flex items-center gap-1.5 font-medium text-sm leading-none">{w ? <Dot cls="w" /> : null}{n}</span>
    <span className="text-muted-foreground text-sm leading-normal">{s}</span>
    {g ? <span className="text-muted-foreground text-sm leading-normal">{g}</span> : null}
    {full != null && <Progress value={full} aria-valuenow={full} aria-label="Fill" className="mt-1" />}
  </>);
};

/** shadcn pins ItemMedia to the title line whenever a row has a description. That
 *  read top-heavy once row icons went to 24px (and always did for a face), so media
 *  centres against the whole row instead. */
const CENTER_MEDIA = "group-has-data-[slot=item-description]/item:translate-y-0 group-has-data-[slot=item-description]/item:self-center";
/** Button kinds: p = primary, g = secondary/outline, ghost = quiet, irr = irreversible
 *  but still a record (teal), del = takes something away (red); " disabled" suffix draws a gated action.
 *  Teal is for a write you meant to make; red is for a loss: ending a membership,
 *  cancelling an order, breaking an integration, discarding queued work, kicking a keg. */
type BtnBase = "p" | "g" | "ghost" | "irr" | "del";
type BtnKind = BtnBase | `${BtnBase} disabled`;
type VolumeUnit = "oz" | "gal" | "bbl" | "mL" | "L";

/** A row is a tap target when its trailing slot declares `data-tap`: the Open
 *  chevron (E.nav) or a verb (E.act). A switch or a stepper there is its own
 *  control, so the row around it keeps the plain cursor. Read by CSS on the
 *  row, never by inspecting the child. Its hover fill is padded past the
 *  text, and the matching negative margin keeps the text on the column edge
 *  (w-auto replaces Item's w-full so both margins widen the row). */
const TAP_ROW = "has-[[data-tap]]:cursor-pointer has-[[data-tap]]:select-none has-[[data-tap]]:hover:bg-accent/50 has-[[data-tap]]:-mx-4 has-[[data-tap]]:w-auto has-[[data-tap]]:px-4";
/** Opt in for primary row navigation, never a destructive action. Translation
 *  would make the pressed link its cover's containing block instead of the row. */
export const ROW_LINK_COVER = "after:absolute after:inset-0 active:not-aria-[haspopup]:translate-none";

/** Keys the fields itself, so callers pass bare elements. The index is the
 *  identity because a field group is a fixed, ordered list — never reordered,
 *  filtered, or conditionally dropped. Children.toArray cannot do this job:
 *  React validates the caller's array for keys before this function runs, so
 *  it has already warned by the time toArray gets to re-key the clones. */
const fieldGrid = (fields: React.ReactNode[], className: string) => (
  <div className={cn("grid gap-2 [&>*]:min-w-0", className)}>
    {fields.map((field, i) => <Fragment key={i}>{field}</Fragment>)}
  </div>
);

/** What a live adapter passes to make a field its own: an onChange, or none
 *  with `disabled` for a read-out that must not look editable. Fixtures pass
 *  nothing and draw a default value. */
export type FieldControls = Pick<React.InputHTMLAttributes<HTMLInputElement>, "id" | "name" | "disabled" | "required" | "readOnly" | "min" | "max" | "step" | "minLength" | "maxLength" | "pattern" | "placeholder" | "autoComplete" | "inputMode" | "aria-label" | "aria-invalid" | "aria-describedby" | "form" | "onBlur"> & {
  onChange?: (value: string) => void;
  /** Inline row controls already have visible context. */
  hideLabel?: boolean;
  contextualLabels?: boolean;
  /** What is wrong with the value, shown under the field (#1121). The field is
   *  marked invalid; pass `id` too, so the message (`${id}-error`) is linked.
   *  Pass it once the user has left the field (`onBlur`), not while typing. */
  error?: string;
};

/** A picker with nothing to offer says so, and where the missing record is
 *  made (#1123). `href` is that page on a live screen; the inventory leaves it
 *  out and the link stays "#". `to` names the inventory screen it opens. With
 *  no `label` there is no link: `text` then names who can add the record.
 *  Draft editors can set `target` to keep unsaved work open during setup. */
export type PickEmpty = { text: string; href?: string; label?: string; to?: string; target?: "_blank" };

/** One aria-describedby value from several optional ids. */
export const describedBy = (...ids: (string | undefined)[]) => ids.filter(Boolean).join(" ") || undefined;

/** A field's error wiring: the invalid flag and description for the control,
 *  and the FieldError message under it. */
function fieldError(controls?: Pick<FieldControls, "id" | "error" | "aria-invalid" | "aria-describedby">) {
  const errorId = controls?.error && controls.id ? `${controls.id}-error` : undefined;
  return {
    invalid: controls?.error ? true : controls?.["aria-invalid"],
    describedBy: describedBy(controls?.["aria-describedby"], errorId),
    message: controls?.error ? <FieldError id={errorId}>{controls.error}</FieldError> : null,
  };
}

/** The empty note under a picker, outside the control, so a disabled or
 *  unopenable picker still explains itself. */
const emptyNote = (empty: PickEmpty, id?: string) => (
  <FieldDescription id={id}>
    {empty.text}{empty.label ? <> <Link href={empty.href ?? "#"} data-to={empty.to} target={empty.target} rel={empty.target ? "noopener" : undefined}>{empty.label}</Link></> : null}
  </FieldDescription>
);

export const E = {
  palette: (placeholder: string, groups: PaletteGroup[]) => <Palette placeholder={placeholder} groups={groups} />,
  /** Page title. `action` is a list-create button (New order, New customer):
   *  full-width under the title on the phone, on the title row from md up. */
  hd: (t: React.ReactNode, r: React.ReactNode = "", action?: React.ReactNode) => {
    const title = (
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">{t}</h1>
        <span className="text-xs text-muted-foreground">{r}</span>
      </div>
    );
    if (!action) return title;
    return (
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        {title}
        {action}
      </div>
    );
  },
  /** A detail screen's header: an arrow link to the parent area above the title.
   *  `action` is the same list-create slot `hd` takes; `href` is where the
   *  arrow goes on a live page (fixtures leave it "#"). `screen` names the
   *  destination screen when the parent's title is not its screen name
   *  ("Packaging" is the Packaging runs screen), as `link` does. */
  back: (to: React.ReactNode, title: React.ReactNode, action?: React.ReactNode, href = "#", screen?: string) => {
    const head = (
      <div className="flex flex-col gap-1">
        <Link href={href} data-to={screen} className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Icon icon={ArrowLeft01Icon} />{to}</Link>
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
    );
    if (!action) return head;
    return (
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        {head}
        {action}
      </div>
    );
  },
  /** A group heading, larger than `ttl`: the beer over its formats on Confirm order, the ship date on Pick sheet, the one Gravity unit section on Units. Both render h2, so the `ttl`s after it sit beside it in the outline. */
  group: (t: React.ReactNode) => <h2 className="mt-3 text-base font-semibold">{t}</h2>,
  /** The same beer name in a table's first column (Pick), at the row's text size so its row is no taller than a format row; a long name and alias wraps on a phone. */
  brand: (t: React.ReactNode) => <span className="inline-block max-w-28 whitespace-normal font-semibold md:max-w-none">{t}</span>,
  /** `id` makes the title an anchor; scroll-m keeps it clear of the sticky header (as screen-index does). */
  ttl: (t: React.ReactNode, id?: string) => <h2 id={id} className={cn("mt-2 text-sm font-medium text-muted-foreground", id && "scroll-m-20")}>{t}</h2>,
  /** `icon` says which kind of thing a row is — only in lists that mix kinds
   * (Today, search); a homogeneous list gets none (docs/plans/hugeicons.md §3). */
  /** No box (#909 §2E): the row's text sits flush with the column's headings
   *  and fields. A row cannot see its neighbour, so the hairline between
   *  consecutive rows is CSS in app/globals.css, keyed on `data-row`.
   *  foot: fields that belong to this row, drawn inside it on their own
   *  line. A lot code and a best-by are facts about the line being received,
   *  so they sit in it; listing them after the row made the reader match
   *  "Citra lot" to a Citra row by name. Item is flex-wrap, so the footer
   *  takes a full line without any layout of its own. It draws no rule of
   *  its own: one would read as the hairline between rows and cut the line's
   *  fields away from it. */
  row: (t: React.ReactNode, s: React.ReactNode = "", n: React.ReactNode = "", cls: RowClass = "", icon?: IconSvgElement | React.ReactElement, foot?: React.ReactNode) => (
    <Item data-row data-gated={cls === "dis" || undefined} className={cn("relative rounded-none border-0 px-0", cls === "dis" ? "cursor-not-allowed opacity-50" : TAP_ROW)}>
      {(icon || dotColor[cls]) && (
        <ItemMedia className={CENTER_MEDIA}>
          {icon ? <RowMedia icon={icon} cls={cls} /> : <Dot cls={cls} />}
        </ItemMedia>
      )}
      <ItemContent>
        <ItemTitle>{t}</ItemTitle>
        {s ? <ItemDescription>{s}</ItemDescription> : null}
      </ItemContent>
      {n ? <ItemActions>{typeof n === "string" ? <span className="text-sm text-muted-foreground">{n}</span> : n}</ItemActions> : null}
      {foot ? <ItemFooter className="flex-col items-stretch gap-2">{foot}</ItemFooter> : null}
    </Item>
  ),
  /** Soft-filled workflow entry (primary and destructive are text-only in dark). Tone describes
   *  the action, independently of row status.
   *  `href` makes it a link on a live page, `onClick` a button that acts in place; fixtures leave both out.
   *  `disabled` holds an in-place action while its command runs.
   *  `linkClassName` styles only live links, including opt-in whole-row covers.
   *  A link to a record page is not prefetched (lib/mgr/row-link-prefetch.ts).
   *  Primary and destructive keep their 10% tint on hover: the tap row's hover wash already
   *  darkens underneath, and a deeper tint drops the text below AA (#1041). Dark mode drops
   *  that tint, at rest and on hover: it pulled the text below AA when hovered on every surface,
   *  and at rest on popovers (#1065). Success, attention and info restate their hover fill under
   *  dark:, or the ghost Button's dark:hover:bg-muted/50 replaces it and hovered attention text
   *  falls below AA on cards. */
  act: (t: React.ReactNode, tone: "primary" | "success" | "attention" | "info" | "destructive" = "primary", href?: string, onClick?: () => void, disabled?: boolean, linkClassName?: string) => (
    <Button variant="ghost" size="sm" type="button" data-row-action data-tap asChild={Boolean(href)} onClick={onClick} disabled={disabled} className={cn(
      href && linkClassName,
      tone === "destructive" && "bg-destructive/10 text-destructive hover:bg-destructive/10 hover:text-destructive dark:bg-transparent dark:hover:bg-transparent",
      tone === "primary" && "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary dark:bg-transparent dark:hover:bg-transparent",
      tone === "success" && "bg-success text-success-foreground hover:bg-success/80 hover:text-success-foreground dark:hover:bg-success/80",
      tone === "attention" && "bg-attention text-attention-foreground hover:bg-attention/80 hover:text-attention-foreground dark:hover:bg-attention/80",
      tone === "info" && "bg-info text-info-foreground hover:bg-info/80 hover:text-info-foreground dark:hover:bg-info/80",
    )}>{href ? <Link href={href} prefetch={rowLinkPrefetch(href)}>{t}</Link> : t}</Button>
  ),
  /** A status word. Not a button; `href` makes it a jump to the section that explains it. */
  status: (t: React.ReactNode, tone: "ok" | "w" | "" = "", href?: string) => {
    const body = <>{tone === "ok" ? <Dot cls="ok" /> : null}{t}</>;
    return (
      <Badge variant={tone === "w" ? "secondary" : "outline"} className={cn("gap-1.5", tone === "w" && "bg-warning text-warning-foreground [a]:hover:bg-warning/80")} asChild={Boolean(href)}>
        {href ? <a href={href}>{body}</a> : body}
      </Badge>
    );
  },
  /** An on/off setting. */
  sw: (on: boolean, label: string, onChange?: (checked: boolean) => void, disabled = false) => <Switch {...(onChange ? { checked: on, onCheckedChange: onChange } : { defaultChecked: on })} aria-label={label} disabled={disabled} />,
  /** Fills the phone column; hugs the label from md up (`w-fit`, not `w-auto`:
   *  a column flex item with width:auto still stretches). Entry cards override
   *  back to full-width because they stay a phone-width column on the desk.
   *  `data-to` names the screen a link opens when its label is not that screen's name, as on E.back. */
  btn: (t: React.ReactNode, k: BtnKind = "p", href?: string, onClick?: () => void, attributes?: { type?: "button" | "submit"; "data-preview-action"?: boolean; "data-to"?: string }) => {
    const [kind, disabled] = k.split(" ") as [BtnBase, string?];
    return (
      <Button
        {...attributes}
        variant={kind === "g" ? "outline" : kind === "ghost" ? "ghost" : kind === "del" ? "destructive" : "default"}
        disabled={Boolean(disabled)}
        type={attributes?.type ?? (onClick ? "button" : undefined)}
        onClick={onClick}
        asChild={Boolean(href) && !disabled}
        className={cn(
          // A lone verb sits where a group would end: right, on the desk.
          "w-full md:w-fit md:self-end",
          kind === "irr" && "bg-irreversible text-irreversible-foreground hover:bg-irreversible/90",
        )}
        {...(kind === "irr" ? { "data-variant": "irreversible" } : {})}
      >
        {href && !disabled ? <Link href={href}>{t}</Link> : t}
      </Button>
    );
  },
  /** A row of buttons; a tuple may add an href, which makes that button a link. */
  btns: (arr: (React.ReactNode | [React.ReactNode, BtnKind, string?])[], c: "c2" | "c3" = "c2") => (
    <div className={cn("grid gap-2 md:flex md:flex-wrap md:justify-end", c === "c3" ? "grid-cols-3" : "grid-cols-2")}>
      {arr.map((v, i) => (
        <React.Fragment key={i}>{Array.isArray(v) ? E.btn(v[0], v[1], v[2]) : E.btn(v)}</React.Fragment>
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
  /** A typed quantity under its visible label: the OS keyboard is the keypad.
   *  unit renders as a trailing addon — plain text ("bbl"), chips, or a
   *  segmented unit choice (`E.tabs` hugged with "w-fit"). The label, the
   *  field's clipping and addon padding live in components/mgr/qty.tsx,
   *  shared with `volume`. */
  qty: (value: string, unit?: React.ReactNode, label = "Quantity", id?: string, controls?: FieldControls) => {
    const error = fieldError({ ...controls, id });
    return <>
      <Qty value={value} unit={unit} label={label} id={id} onChange={controls?.onChange} invalid={error.invalid} describedBy={error.describedBy} />
      {error.message}
    </>;
  },
  /** A view switcher. E.tabs draws no TabsContent: the body below stands in
   *  for the active panel. A filter that swaps the whole list (Work's kinds, an
   *  order's states) is a tab bar too. A live in-place filter (WorkView) calls
   *  `TabBar` with `panel` instead, so its tabs control real tabpanels.
   *  Single-choice fields stay chips, except the unit a quantity is entered in:
   *  that is a switcher on the number itself and rides inside the field as
   *  `E.qty`'s addon (see `volume`).
   *  Spans the column by default; pass width classes to hug ("w-fit", an input
   *  addon) or to scroll a bar too long for the phone ("overflow-x-auto").
   *  `to` names the screen a tab opens; the explorer walks there and hides tabs
   *  the persona may not open. See components/mgr/qty.tsx for the a11y caveat. */
  tabs: (names: string[], on = 0, cls = "w-full", to?: Record<string, string>) => (
    <TabBar names={names} on={on} cls={cls} to={to} />
  ),
  chips: (arr: string[], on = 0, bright = false, controls?: { onChange: (index: number) => void; disabled?: boolean; label?: string }) => (
    <ToggleGroup type="single" {...(controls ? { value: arr[on], onValueChange: (value: string) => { if (value) controls.onChange(arr.indexOf(value)); }, disabled: controls.disabled, "aria-label": controls.label } : { defaultValue: arr[on] })} variant="outline" size="sm" className="flex-wrap justify-start">
      {arr.map((c) => (
        <ToggleGroupItem key={c} value={c} className={cn(bright && BRIGHT_ON)}>{c}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  ),
  /** An atomic format's volume: a qty whose unit addon is the per-instance unit choice. */
  volume: (value: string, units: VolumeUnit[], on = 0) => <VolumeField value={value} units={units} on={on} />,
  /** Commit; CommandForm lifts this out of the scroll region so the verb stays on the phone.
   *  Stacked on the phone, right-aligned on the desk — same as CommandFormFooter. */
  pin: (t: React.ReactNode) => (
    <div data-pin className="flex flex-col gap-2 md:flex-row md:justify-end">
      {t}
    </div>
  ),
  /** A form's submit, withheld while `submitting` or while `reason` (from
   *  submitReason, lib/mgr/submit-reason.ts: "Still needed: …") names what is
   *  missing; the reason is printed beside it and linked by aria-describedby
   *  (#1122). `id` names the button, and the reason is `${id}-reason`. Other
   *  options are passed to the Button (variant, className, form). */
  submit: (label: React.ReactNode, options: Omit<SubmitButtonProps, "label">) => <SubmitButton label={label} {...options} />,
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
  link: (t: React.ReactNode, to?: string, href = "#") => (
    <a href={href} data-to={to} className="text-sm text-muted-foreground underline">{t}</a>
  ),
  /** An editable field. type is the native input type; "date" pops the calendar
   *  (DatePicker), which honors `max` as the last day it offers. */
  edit: (label: string, value: string, type: React.HTMLInputTypeAttribute = "text", suggestions?: string[], controls?: FieldControls) => {
    // `error` is drawn under the field (fieldError), never passed to the input.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { onChange, hideLabel, contextualLabels, error: _error, ...rest } = controls ?? {};
    const error = fieldError(controls);
    const attributes = { ...rest, "aria-invalid": error.invalid, "aria-describedby": error.describedBy };
    // DatePicker draws its own Field and takes no invalid flag, so a date's error is its message alone.
    if (type === "date") return <><DatePicker label={label} defaultValue={value} value={onChange ? value : undefined} onChange={onChange} disabled={controls?.disabled} required={controls?.required} name={controls?.name} max={controls?.max === undefined ? undefined : String(controls.max)} aria-describedby={error.describedBy} />{error.message}</>;
    // A whole number (a contract quantity, an overdue threshold) is counted,
    // not typed: the same −/+ stepper Weekly count uses.
    if (type === "number") {
      return (
        <Field data-disabled={attributes.disabled} data-invalid={attributes["aria-invalid"]}>
          {!hideLabel && <FieldLabel htmlFor={attributes.id}>{label}</FieldLabel>}
          {E.stq(Number(value) || 0, label, { ...attributes, value, onChange, contextualLabels, step: controls?.step ?? "any", required: controls?.required ?? false })}
          {error.message}
        </Field>
      );
    }
    // The options are the datalist's identity, so the id derives from them: two
    // fields sharing a label (a card names its own material, so both lot fields
    // are just "Lot") never collide, and two offering the same options correctly
    // share one list. A caller cannot forget to disambiguate.
    const listId = suggestions?.length ? `list-${suggestions.join("-").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}` : undefined;
    return (
      <Field data-disabled={attributes.disabled} data-invalid={attributes["aria-invalid"]}>
        {!hideLabel && <FieldLabel htmlFor={attributes.id}>{label}</FieldLabel>}
        <Input type={type} aria-label={label} {...attributes} {...(onChange ? { value, onChange: (event) => onChange(event.target.value) } : { defaultValue: value })} list={listId} />
        {listId ? <datalist id={listId}>{suggestions!.map((o) => <option key={o} value={o} />)}</datalist> : null}
        {error.message}
      </Field>
    );
  },
  /** Short field pairs sit side by side on desk; larger groups fit four on desk
   *  and two on phone. The frame is an iframe, so md: is the frame width.
   *  Pass bare fields — the grid keys them. Pass the same fields in the same
   *  order on every render; a conditional field would shift the index keys. */
  cols: (...fields: React.ReactNode[]) => fieldGrid(
    fields,
    fields.length > 2 ? "grid-cols-2 md:grid-cols-4 md:gap-x-6" : "md:grid-cols-2 md:gap-x-6",
  ),
  /** Fields that read as one phrase (a quantity, its unit, and what it is per)
   *  stay on one line at every width; three at most, or the phone can’t.
   *  Keyed by the grid, and fixed in order, exactly as in cols. */
  inline: (...fields: [React.ReactNode, React.ReactNode, React.ReactNode?]) =>
    fieldGrid(fields, fields.length === 3 ? "grid-cols-3" : "grid-cols-2"),
  /** A time-of-day window as one two-thumb range: start and end are 24-hour "hh:mm". */
  window: (label: string, start: string, end: string) => <TimeWindowField label={label} start={start} end={end} />,
  /** Several picked values at once: a location is often a taproom and storage
   *  and a warehouse, so the control has to admit more than one answer. Picked
   *  values fill bright (#493): the outline on-state alone reads as faint grey.
   *  `description` is drawn under the group; pass its id as aria-describedby. */
  picks: (label: string, values: string[], options: (string | { value: string; label: string })[], controls?: { onChange?: (values: string[]) => void; disabled?: boolean; "aria-invalid"?: boolean; "aria-describedby"?: string; description?: ReactNode }) => (
    <Field data-disabled={controls?.disabled} data-invalid={controls?.["aria-invalid"]}>
      <FieldLabel>{label}</FieldLabel>
      <ToggleGroup type="multiple" {...(controls?.onChange ? { value: values, onValueChange: controls.onChange } : { defaultValue: values })} disabled={controls?.disabled} aria-invalid={controls?.["aria-invalid"]} aria-describedby={controls?.["aria-describedby"]} variant="outline" size="sm" aria-label={label} className="flex-wrap justify-start">
        {options.map(o => typeof o === "string" ? <ToggleGroupItem key={o} value={o} className={BRIGHT_ON}>{o}</ToggleGroupItem> : <ToggleGroupItem key={o.value} value={o.value} className={BRIGHT_ON}>{o.label}</ToggleGroupItem>)}
      </ToggleGroup>
      {controls?.description}
    </Field>
  ),
  /** A picked value: a Select for short fixed lists; long lists (SKU, customer) keep opening Entity picker.
   *  The trigger shows the matching option's label (so server markup names the choice) unless `displayValue` overrides it.
   *  `empty` is shown when nothing but a "" placeholder is offered. */
  pick: (label: string, value: string, options: (string | { value: string; label: string; disabled?: boolean })[], controls?: FieldControls & { forward?: boolean; displayValue?: ReactNode; description?: ReactNode; empty?: PickEmpty }) => {
    const empty = controls?.empty && !options.some((o) => (typeof o === "string" ? o : o.value) !== "") ? controls.empty : undefined;
    const emptyId = empty && controls?.id ? `${controls.id}-empty` : undefined;
    const error = fieldError(controls);
    return (
    <Field data-disabled={controls?.disabled} data-invalid={error.invalid}>
      {!controls?.hideLabel && <FieldLabel htmlFor={controls?.id}>{label}</FieldLabel>}
      <Select {...(controls?.onChange ? { value, onValueChange: (next) => controls.onChange?.(next === "__empty_field__" ? "" : next) } : { defaultValue: value })} disabled={controls?.disabled} required={controls?.required} name={controls?.name} form={controls?.form}>
        <SelectTrigger id={controls?.id} aria-label={controls?.["aria-label"] ?? label} aria-describedby={describedBy(error.describedBy, emptyId)} aria-invalid={error.invalid} className={controls?.forward ? "[&_svg:last-child]:hidden" : undefined}><SelectValue placeholder={options.find((o): o is { value: string; label: string } => typeof o !== "string" && o.value === "")?.label ?? controls?.placeholder}>{controls?.displayValue ?? options.map((o) => typeof o === "string" ? { value: o, label: o } : o).find((o) => o.value === value)?.label}</SelectValue>{controls?.forward ? <DirectionIcon label="Open" /> : null}</SelectTrigger>
        <SelectContent><SelectGroup>{options.map((o) => typeof o === "string" ? <SelectItem key={o} value={o || "__empty_field__"}>{o}</SelectItem> : <SelectItem key={o.value} value={o.value || "__empty_field__"} disabled={o.disabled}>{o.label}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
      {controls?.description}
      {empty && emptyNote(empty, emptyId)}
      {error.message}
    </Field>
    );
  },
  /** A picked value from a list too long for a Select (materials): the trigger opens a
   *  searchable sheet (phone) or dialog (desk). `placeholder` is the trigger text when
   *  nothing is picked; `selectedLabel` names a retained value missing from `options`.
   *  With no options the open list says "No … to choose yet", never "No matching …";
   *  `empty` adds the note and link under the trigger. */
  searchPick: (label: string, value: string, options: SearchPickOption[], controls?: Pick<FieldControls, "id" | "disabled" | "placeholder" | "hideLabel" | "onChange" | "aria-describedby"> & { selectedLabel?: string; previewAction?: boolean; outlined?: boolean; empty?: PickEmpty }) => {
    const empty = options.length ? undefined : controls?.empty;
    const emptyId = empty && controls?.id ? `${controls.id}-empty` : undefined;
    return (
    <Field data-disabled={controls?.disabled}>
      {!controls?.hideLabel && <FieldLabel htmlFor={controls?.id}>{label}</FieldLabel>}
      <SearchPick label={label} value={value} options={options} onChange={controls?.onChange} id={controls?.id} disabled={controls?.disabled} errorId={describedBy(controls?.["aria-describedby"], emptyId)} selectedLabel={controls?.selectedLabel} previewAction={controls?.previewAction} outlined={controls?.outlined}
        title={label} placeholder={controls?.placeholder ?? `Select ${label.toLowerCase()}`} searchPlaceholder={`Search ${label.toLowerCase()}`} noMatchMessage={`No matching ${label.toLowerCase()}`} emptyMessage={controls?.empty?.text ?? `No ${label.toLowerCase()} to choose yet`} />
      {empty && emptyNote(empty, emptyId)}
    </Field>
    );
  },
  // The amber box and the quiet box differed only by tint; the glyph is the
  // second channel, so the difference survives a dim screen or a colorblind eye.
  note: (t: React.ReactNode, role: "note" | "alert" = "note") => (
    // A warm card, sitting at the same lift off the page as a plain Alert's
    // bg-card, so attention is carried by the amber ink and rule rather than by
    // a filled panel competing with the row beside it.
    <Alert role={role} className="border-warning-foreground/40 bg-warning text-warning-foreground">
      <Icon icon={Alert02Icon} />
      {/* text-pretty, not shadcn's text-balance: balancing shortens every line to
          even them up, so a two-line note reads as a narrow block in a wide card. */}
      <AlertDescription className="text-pretty text-warning-foreground">{t}</AlertDescription>
    </Alert>
  ),
  info: (t: React.ReactNode, role: "note" | "alert" = "note") => (
    <Alert role={role} className="border-info-foreground/40 bg-info text-info-foreground">
      <Icon icon={InformationCircleIcon} />
      <AlertDescription className="text-pretty text-info-foreground">{t}</AlertDescription>
    </Alert>
  ),
  /** Plain muted text, or nothing, for the caller's always-mounted role="status"
   *  region, so a screen reader hears the change politely. E.info and E.note
   *  default to static notes; only explicit errors use their alert role. */
  polite: (t: React.ReactNode) => (t ? <p className="text-sm text-muted-foreground">{t}</p> : null),
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
  /** Status tiles. `actions` sit under a tile's facts; with an `href` too, the facts stay the link. */
  tiles: (arr: [React.ReactNode, React.ReactNode, React.ReactNode?, (0 | 1)?, number?, string?, React.ReactNode?][]) => (
    <ItemGroup className="grid grid-cols-2 gap-2 md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
      {arr.map(([n, s, g, w, f, href, actions], i) => {
        const content = <TileContent {...{ n, s, g, w, f }} />;
        const facts = href ? <Link href={href}>{content}</Link> : content;
        return (
          <Item key={i} variant="outline" size="sm" className="flex-col items-start gap-0.5" asChild>
            {actions ? <div>{facts}{actions}</div> : href ? facts : <button type="button">{content}</button>}
          </Item>
        );
      })}
    </ItemGroup>
  ),
  /** A small fixed table whose headers sort its rows and remember the last
   *  sort per browser (components/mgr/sort-table.tsx). `{ sortable: false }`
   *  keeps the given row order, for rows whose position carries meaning;
   *  `{ dense: true }` tightens the rows of a read-only list. */
  tbl: (hd: React.ReactNode[], rows: React.ReactNode[][], align?: ("l" | "r")[], opts?: { sortable?: false; dense?: true }) => (
    <SortTable headers={hd} rows={rows} align={align} sortable={opts?.sortable} dense={opts?.dense} />
  ),
  /** A blank list. A bare node is the whole message; an {@link EmptyState}
   *  splits it into the fact and the sentence saying what to do next.
   *  `action` sits centered under that sentence, not at the page's foot. */
  blank: (t: React.ReactNode | EmptyState, icon?: IconSvgElement, action?: React.ReactNode) => {
    const state = t && typeof t === "object" && "title" in t ? t as EmptyState : undefined;
    const description = state ? state.description : t as React.ReactNode;
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          {icon && <EmptyMedia variant="icon"><Icon icon={icon} size={20} /></EmptyMedia>}
          {state && <EmptyTitle>{state.title}</EmptyTitle>}
          {description && <EmptyDescription>{description}</EmptyDescription>}
        </EmptyHeader>
        {action && <EmptyContent className="md:*:self-center">{action}</EmptyContent>}
      </Empty>
    );
  },
  /** A blank labeled input. The label sits over the control like every other
   *  field (shadcn Field default); `hint` is the placeholder, never the label. */
  inp: (label: string, hint?: string) => (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input placeholder={hint} aria-label={label} />
    </Field>
  ),
  /** A search box: the one input whose placeholder is its whole label. A list
   *  passes `name`, `defaultValue` and `maxLength` and wraps it in a GET form, plus `onChange`
   *  to search as you type (components/mgr/list-controls.tsx); a drawing passes none. */
  search: (t = "Search", controls?: { name: string; defaultValue: string; maxLength: number; onChange?: React.ChangeEventHandler<HTMLInputElement> }) => <Input type="search" placeholder={t} aria-label={t} {...controls} />,
  stq: (v: number, label = "Quantity", controls?: FieldControls & { value: string }) => <StepQuantity label={label} defaultValue={String(v)} min={controls ? controls.min : 0} step={controls ? controls.step : 1} {...controls} required={controls ? controls.required !== false : false} />,
  gated: (t: React.ReactNode, why: React.ReactNode = "isn’t available yet") => E.row(t, why, "", "dis", SquareLock01Icon),
  /** A row that opens something. `href` makes the whole row the link, as E.act
   *  and E.btn already do; `to` names the inventory destination when its label
   *  is not that screen's name. Fixtures leave both out unless a route is shown.
   *  A link to a record page is not prefetched (lib/mgr/row-link-prefetch.ts). */
  nav: (t: React.ReactNode, s: React.ReactNode = "", cls: RowClass = "", icon?: IconSvgElement | React.ReactElement, href?: string, to?: string) => {
    const row = E.row(t, s, <span data-tap><DirectionIcon label="Open" /></span>, cls, icon);
    return href ? <Link href={href} prefetch={rowLinkPrefetch(href)} data-to={to} className="block">{row}</Link> : row;
  },
  /** A document line: a material or SKU with its quantity and the fields that
   *  belong to it. No line wants an icon, so this fills that slot rather than
   *  every call site writing the hole. */
  line: (t: React.ReactNode, s: React.ReactNode, n: React.ReactNode, cls: RowClass, fields: React.ReactNode) => E.row(t, s, n, cls, undefined, fields),
  sp: () => <div className="flex-1" />,
  comp: (roles: readonly StaffRole[] = ["admin"], container?: HTMLElement | null) => <ComposerDemo disabled={!roles.length} container={container} />,
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
