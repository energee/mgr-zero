// components/mgr/e.tsx — the screen vocabulary, ported one-for-one from the
// wireframe file's `E` helper (.agents/superpowers/specs/2026-08-31-mgr-
// wireframes.html): same names, same arity, JSX out. Each helper composes a
// shadcn primitive from components/ui plus Tailwind layout; screen authors
// (components/mgr/screens.tsx) use only these and never touch components/ui.
import * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TabBar } from "@/components/mgr/app-shell";
import { PORTAL_NAV, STAFF_NAV } from "@/lib/mgr/nav";
import { cn } from "@/lib/utils";

/** Row modifiers from the wireframe: w = needs attention, ok = current, dis = gated. */
type RowClass = "" | "w" | "ok" | "dis";
const rowClass: Record<RowClass, string> = {
  "": "",
  w: "border-warning-foreground/40 bg-warning [&_[data-slot=item-description]]:text-warning-foreground",
  ok: "border-primary",
  dis: "border-dashed opacity-55",
};

/** Button kinds: p = primary (hop), g = ghost/outline, irr = irreversible (copper). */
type BtnKind = "p" | "g" | "irr";
const mono = "font-mono tabular-nums";

export const E = {
  hd: (t: React.ReactNode, r: React.ReactNode = "") => (
    <div className="flex items-center justify-between gap-2 border-b pb-2 font-heading text-lg font-semibold">
      <span className="flex min-w-0 items-center gap-2">{t}</span>
      <span className={cn(mono, "text-xs font-normal text-muted-foreground")}>{r}</span>
    </div>
  ),
  ttl: (t: React.ReactNode) => <h2 className="font-heading text-xl font-semibold">{t}</h2>,
  row: (t: React.ReactNode, s: React.ReactNode = "", n: React.ReactNode = "", cls: RowClass = "") => (
    <Item variant="outline" className={cn("min-h-12 bg-card", rowClass[cls])}>
      <ItemContent>
        <ItemTitle>{t}</ItemTitle>
        {s ? <ItemDescription>{s}</ItemDescription> : null}
      </ItemContent>
      {n ? <ItemActions className={cn(mono, "text-sm whitespace-nowrap")}>{n}</ItemActions> : null}
    </Item>
  ),
  btn: (t: React.ReactNode, k: BtnKind = "p") => (
    <Button
      variant={k === "g" ? "outline" : "default"}
      className={cn("min-h-12 w-full text-base", k === "irr" && "bg-irreversible text-irreversible-foreground hover:bg-irreversible/90")}
      {...(k === "irr" ? { "data-variant": "irreversible" } : {})}
    >
      {t}
    </Button>
  ),
  btns: (arr: (React.ReactNode | [React.ReactNode, BtnKind])[], c: "c2" | "c3" = "c2") => (
    <div className={cn("grid gap-2", c === "c3" ? "grid-cols-3" : "grid-cols-2")}>
      {arr.map((v, i) => (
        <React.Fragment key={i}>{Array.isArray(v) ? E.btn(v[0], v[1]) : E.btn(v)}</React.Fragment>
      ))}
    </div>
  ),
  num: (v: React.ReactNode, s: React.ReactNode) => (
    <div className="rounded-sm border bg-card p-3 text-right">
      <b className={cn(mono, "block text-3xl font-medium")}>{v}</b>
      <span className={cn(mono, "text-xs text-muted-foreground")}>{s}</span>
    </div>
  ),
  chips: (arr: string[], on = 0) => (
    <ToggleGroup type="single" value={arr[on]} variant="outline" className="flex-wrap justify-start gap-2">
      {arr.map((c) => (
        <ToggleGroupItem key={c} value={c} className={cn(mono, "min-h-12 rounded-sm border px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground")}>
          {c}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  ),
  pad: () => (
    <div className="mt-auto grid grid-cols-3 gap-2">
      {"1 2 3 4 5 6 7 8 9 . 0 ⌫".split(" ").map((k) => (
        <Button key={k} variant="outline" className={cn(mono, "min-h-12 text-base")}>
          {k}
        </Button>
      ))}
    </div>
  ),
  tape: (arr: [React.ReactNode, React.ReactNode?][]) => (
    <ol className={cn(mono, "ml-1 flex flex-col gap-1 border-l-2 border-rule pl-3 text-xs")}>
      {arr.map(([a, b], i) => (
        <li key={i} className="relative flex justify-between gap-2 before:absolute before:-left-[17px] before:top-1.5 before:size-1.5 before:rounded-full before:bg-primary">
          <span>{a}</span>
          <span>{b ?? ""}</span>
        </li>
      ))}
    </ol>
  ),
  fld: (k: React.ReactNode, v: React.ReactNode) => (
    <div className="flex min-h-12 items-center justify-between gap-2 border-b py-1">
      <b className="font-medium">{k}</b>
      <span className={cn(mono, "text-right text-sm text-primary")}>{v}</span>
    </div>
  ),
  note: (t: React.ReactNode) => (
    <Alert className="border-warning-foreground/40 bg-warning text-warning-foreground">
      <AlertDescription className="text-warning-foreground">{t}</AlertDescription>
    </Alert>
  ),
  info: (t: React.ReactNode) => (
    <Alert className="border-transparent bg-accent text-accent-foreground">
      <AlertDescription className="text-accent-foreground">{t}</AlertDescription>
    </Alert>
  ),
  /** Annotation chips; the gallery renders this under the frame, never inside it. */
  states: (arr: [string, string, (0 | 1)?][]) => (
    <dl className="flex flex-wrap gap-1.5 text-xs">
      {arr.map(([a, b, w]) => (
        <div key={a} className={cn("rounded-sm border px-2 py-1", w ? "border-warning-foreground/40 bg-warning text-warning-foreground" : "bg-card")}>
          <dt className="inline font-semibold">{a}</dt> <dd className="inline text-muted-foreground">{b}</dd>
        </div>
      ))}
    </dl>
  ),
  stp: (arr: string[], cur: number) => (
    <div className={cn(mono, "flex items-center gap-1 text-xs text-muted-foreground")}>
      {arr.map((s, i) => (
        <React.Fragment key={s}>
          <Badge variant={i === cur ? "default" : "outline"} className="rounded-sm">{s}</Badge>
          {i < arr.length - 1 && <Separator className={cn("flex-1", i < cur ? "bg-primary" : "")} />}
        </React.Fragment>
      ))}
    </div>
  ),
  tiles: (arr: [React.ReactNode, React.ReactNode, React.ReactNode?, (0 | 1)?, number?][]) => (
    <div className="grid grid-cols-3 gap-1">
      {arr.map(([n, s, g, w, f], i) => (
        <div key={i} className={cn("flex min-h-14 flex-col justify-between rounded-sm border bg-card p-1.5 text-xs", w && rowClass.w)}>
          <b>{n}</b>
          <span>{s}</span>
          <span>{g ?? ""}</span>
          {f != null && (
            <span className="mt-1 block h-1 overflow-hidden rounded-sm bg-muted">
              <i className="block h-full bg-primary" style={{ width: `${f}%` }} />
            </span>
          )}
        </div>
      ))}
    </div>
  ),
  tbl: (hd: React.ReactNode[], rows: React.ReactNode[][]) => (
    <Table className={cn(mono, "text-xs")}>
      <TableHeader>
        <TableRow>
          {hd.map((h, i) => (
            <TableHead key={i} className={cn("h-8", i ? "text-right" : "font-sans")}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            {r.map((c, j) => (
              <TableCell key={j} className={cn("py-1", j ? "text-right" : "font-sans")}>{c}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
  blank: (t: React.ReactNode) => (
    <Empty className="min-h-16 flex-1 border py-4">
      <EmptyDescription>{t}</EmptyDescription>
    </Empty>
  ),
  inp: (t: string) => <Input placeholder={t} aria-label={t} className="min-h-12" />,
  stq: (v: React.ReactNode) => (
    <ButtonGroup className={mono}>
      <Button variant="outline" size="icon" aria-label="Decrease" className="min-h-12 min-w-12">−</Button>
      <span className="flex min-w-8 items-center justify-center text-sm">{v}</span>
      <Button variant="outline" size="icon" aria-label="Increase" className="min-h-12 min-w-12">+</Button>
    </ButtonGroup>
  ),
  gated: (t: React.ReactNode, why: React.ReactNode = "isn’t available yet") => E.row(t, why, "", "dis"),
  nav: (t: React.ReactNode, s: React.ReactNode = "", cls: RowClass = "") => E.row(t, s, "›", cls),
  sp: () => <div className="flex-1" />,
  comp: (portal = false) => (
    <InputGroup className="min-h-14">
      <InputGroupAddon className="border-r pr-2 font-semibold">History</InputGroupAddon>
      <InputGroupTextarea rows={1} placeholder={portal ? "Ask about this account or repeat an order…" : "Say what happened…"} className="min-h-10" />
    </InputGroup>
  ),
  tabs: (on: string) => <TabBar items={STAFF_NAV} active={on} />,
  portal: (on: string) => <TabBar items={PORTAL_NAV} active={on} />,
};
