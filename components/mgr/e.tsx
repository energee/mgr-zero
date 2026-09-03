// components/mgr/e.tsx — the screen vocabulary, ported name-for-name from the
// wireframe file's `E` helper (.agents/superpowers/specs/2026-08-31-mgr-
// wireframes.html) but styled as shadcn defaults: quiet surfaces, one accent,
// color only where it carries meaning (a status dot, not a filled row).
// Target sizing under a coarse pointer lives in app/globals.css, so nothing
// here sets heights. Screen authors use only these and never components/ui.
import * as React from "react";
import { Alert02Icon, ArrowLeft01Icon, InformationCircleIcon, SquareLock01Icon } from "@hugeicons/core-free-icons";
import { Icon, type IconSvgElement } from "@/components/mgr/icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Empty, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

/** Row modifiers from the wireframe: w = needs attention, ok = current, dis = gated. */
type RowClass = "" | "w" | "ok" | "dis";
const dotColor: Partial<Record<RowClass, string>> = { w: "bg-warning-foreground", ok: "bg-primary" };
const Dot = ({ cls }: { cls: RowClass }) => (dotColor[cls] ? <span className={cn("size-2 rounded-full", dotColor[cls])} /> : null);

/** Button kinds: p = primary, g = secondary/outline, irr = irreversible (teal); " disabled" suffix draws a gated action. */
type BtnBase = "p" | "g" | "irr";
type BtnKind = BtnBase | `${BtnBase} disabled`;

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
  row: (t: React.ReactNode, s: React.ReactNode = "", n: React.ReactNode = "", cls: RowClass = "", icon?: IconSvgElement) => (
    <Item variant="outline" className={cn(cls === "dis" && "opacity-50")}>
      {(icon || dotColor[cls]) && (
        <ItemMedia>
          {icon ? <Icon icon={icon} /> : <Dot cls={cls} />}
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
  act: (t: React.ReactNode) => <Button variant="ghost" size="sm">{t}</Button>,
  btn: (t: React.ReactNode, k: BtnKind = "p") => {
    const [kind, disabled] = k.split(" ") as [BtnBase, string?];
    return (
      <Button
        variant={kind === "g" ? "outline" : "default"}
        disabled={Boolean(disabled)}
        className={cn(kind === "irr" && "bg-irreversible text-irreversible-foreground hover:bg-irreversible/90")}
        {...(kind === "irr" ? { "data-variant": "irreversible" } : {})}
      >
        {t}
      </Button>
    );
  },
  btns: (arr: (React.ReactNode | [React.ReactNode, BtnKind])[], c: "c2" | "c3" = "c2") => (
    <div className={cn("grid gap-2", c === "c3" ? "grid-cols-3" : "grid-cols-2")}>
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
  chips: (arr: string[], on = 0) => (
    <ToggleGroup type="single" value={arr[on]} variant="outline" size="sm" className="flex-wrap justify-start">
      {arr.map((c) => (
        <ToggleGroupItem key={c} value={c}>{c}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  ),
  pad: () => (
    <div className="mt-auto grid grid-cols-3 gap-2">
      {"1 2 3 4 5 6 7 8 9 . 0 ⌫".split(" ").map((k) => (
        <Button key={k} variant="outline" size="lg">{k}</Button>
      ))}
    </div>
  ),
  tape: (arr: [React.ReactNode, React.ReactNode?][]) => (
    <ol className="ml-1 flex flex-col gap-1 border-l-2 pl-3 font-mono text-xs text-muted-foreground">
      {arr.map(([a, b], i) => (
        <li key={i} className="flex justify-between gap-2">
          <span className="text-foreground">{a}</span>
          <span>{b ?? ""}</span>
        </li>
      ))}
    </ol>
  ),
  fld: (k: React.ReactNode, v: React.ReactNode) => (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  ),
  /** A filled value the user can change. */
  pick: (k: React.ReactNode, v: React.ReactNode) => E.fld(k, <>{v}<span className="ml-2 text-muted-foreground">›</span></>),
  // The amber box and the quiet box differed only by tint; the glyph is the
  // second channel, so the difference survives a dim screen or a colorblind eye.
  note: (t: React.ReactNode) => (
    <Alert className="bg-warning text-warning-foreground">
      <Icon icon={Alert02Icon} />
      <AlertDescription className="text-warning-foreground">{t}</AlertDescription>
    </Alert>
  ),
  info: (t: React.ReactNode) => (
    <Alert>
      <Icon icon={InformationCircleIcon} />
      <AlertDescription>{t}</AlertDescription>
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
  tiles: (arr: [React.ReactNode, React.ReactNode, React.ReactNode?, (0 | 1)?, number?][]) => (
    <ItemGroup className="grid grid-cols-3 gap-2">
      {arr.map(([n, s, g, w, f], i) => (
        <Item key={i} variant="outline" size="sm" className="flex-col items-start gap-0.5">
          <ItemTitle className="flex items-center gap-1.5">
            {w ? <Dot cls="w" /> : null}
            {n}
          </ItemTitle>
          <ItemDescription>{s}</ItemDescription>
          {g ? <ItemDescription>{g}</ItemDescription> : null}
          {f != null && (
            <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-muted">
              <i className="block h-full bg-primary" style={{ width: `${f}%` }} />
            </span>
          )}
        </Item>
      ))}
    </ItemGroup>
  ),
  tbl: (hd: React.ReactNode[], rows: React.ReactNode[][]) => (
    <Table>
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
  stq: (v: React.ReactNode) => (
    <ButtonGroup>
      <Button variant="outline" size="icon" aria-label="Decrease">−</Button>
      <Button variant="outline" size="icon" aria-label="Increase">+</Button>
      <span className="flex items-center px-2 text-sm">{v}</span>
    </ButtonGroup>
  ),
  gated: (t: React.ReactNode, why: React.ReactNode = "isn’t available yet") => E.row(t, why, "", "dis", SquareLock01Icon),
  nav: (t: React.ReactNode, s: React.ReactNode = "", cls: RowClass = "", icon?: IconSvgElement) => E.row(t, s, "›", cls, icon),
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
