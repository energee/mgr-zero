// components/mgr/venue.tsx — the external venues, in their own design language.
// QuickBooks, Square and Slack render MGR's writes inside their products, so
// these frames are drawn as those products actually present them rather than as
// MGR screens: Intuit's transaction sidebar, Square Dashboard's filter-and-table,
// Slack's App Home / DM / modal. Ported name-for-name from the wireframes file
// (.agents/superpowers/specs/2026-08-31-mgr-wireframes.html) with its chrome CSS
// in ./venue.css — the vendor look is evidence about an integration contract, so
// it is copied, not re-derived. `S` is the Slack vocabulary, `X` the shared
// record vocabulary for the two record venues. Screen bodies use these instead
// of `E`; nothing here is MGR's own UI.
import type { ReactNode } from "react";

/** Wireframe markup shorthand: *bold* and newlines, the only two the fixtures use. */
const mrk = (t: string): ReactNode =>
  t.split("\n").map((line, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {line.split(/\*(.+?)\*/g).map((part, j) => (j % 2 ? <b key={j}>{part}</b> : part))}
    </span>
  ));

/** Slack surfaces: App Home blocks, message blocks and modal fields. */
export const S = {
  h: (t: ReactNode) => <div className="sk-h">{t}</div>,
  s: (t: string) => <div className="sk-s">{mrk(t)}</div>,
  ctx: (t: string) => <div className="sk-ctx">{mrk(t)}</div>,
  sa: (t: string, btn: ReactNode) => (
    <div className="sk-sa">
      <div className="sk-s">{mrk(t)}</div>
      <span className="sk-b">{btn}</span>
    </div>
  ),
  acts: (arr: [ReactNode, string?][]) => (
    <div className="sk-acts">
      {arr.map(([l, k], i) => (
        <span key={i} className={`sk-b ${k ?? ""}`}>{l}</span>
      ))}
    </div>
  ),
  f: (arr: [ReactNode, ReactNode][]) => (
    <div className="sk-f">
      {arr.map(([k, v], i) => (
        <div key={i}><b>{k}</b>{v}</div>
      ))}
    </div>
  ),
  toggle: (label: string, on = true) => (
    <div className="sk-control"><b>{label}</b><button type="button" role="switch" aria-checked={on}><i /></button></div>
  ),
  select: (label: string, value: string) => (
    <label className="sk-control"><b>{label}</b><select defaultValue={value}><option>{value}</option></select></label>
  ),
  /** A Slack action MGR will not enable yet: disabled button plus the reason. */
  dis: (label: ReactNode, why: ReactNode) => (
    <div className="sk-gate">
      <span className="sk-b dis">{label}</span>
      <span className="sk-ctx">{why}</span>
    </div>
  ),
};

/** Shared primitives for the record-shaped venues (QuickBooks, Square). */
const SQ_ITEM_COLS = ["Item", "Reporting category", "Locations", "Sold by", "Status", "Price"];

export const X = {
  h: (t: ReactNode, sub: ReactNode = "") => (
    <div className="x-h">{t}{sub ? <span>{sub}</span> : null}</div>
  ),
  pill: (t: ReactNode, bad?: 1) => <div className={`x-pill ${bad ? "bad" : ""}`}>{t}</div>,
  tot: (arr: [ReactNode, ReactNode, (0 | 1)?][]) => (
    <div className="x-tot">
      {arr.map(([k, v, st], i) => (
        <div key={i} className={st ? "s" : ""}><span>{k}</span><span>{v}</span></div>
      ))}
    </div>
  ),
  err: (title: ReactNode, body: ReactNode) => <div className="x-err"><b>{title}</b>{body}</div>,
  note: (t: ReactNode) => <div className="x-note">{t}</div>,
  // QuickBooks sidebar primitives. The panel states money as a large dollar
  // figure with raised cents, and hides detail behind collapsible sections. The
  // check mark is the paid badge, not a status prefix: pass plain for anything
  // that is not a paid state.
  stat: (t: ReactNode, plain?: 1) => (
    <div className={`qa-stat${plain ? " plain" : ""}`}>{plain ? null : "✔ "}{t}</div>
  ),
  amt: (label: ReactNode, d: ReactNode, c: ReactNode) => (
    <div className="qa-amt"><b>{label}</b><span>$<em>{d}</em><sup>{c}</sup></span></div>
  ),
  when: (label: ReactNode, v: ReactNode) => <div className="qa-when"><b>{label}</b>{v}</div>,
  sec: (t: ReactNode, inner: ReactNode = null) => (
    <div className="qa-sec"><div className="qa-sh">{t}<i>▾</i></div>{inner}</div>
  ),
  more: (t: ReactNode) => <div className="qa-sec"><div className="qa-sh">{t}<i>›</i></div></div>,
  rows: (arr: [ReactNode, ReactNode][]) => (
    <div className="qa-rows">{arr.map(([k, v], i) => <div key={i}><span>{k}</span><span>{v}</span></div>)}</div>
  ),
  sub: (t: ReactNode, lines: ReactNode[]) => (
    <div className="qa-sub"><b>{t}</b>{lines.map((l, i) => <div key={i}>{l}</div>)}</div>
  ),
  link: (t: ReactNode) => <div className="qa-link">{t}</div>,
  /** QuickBooks' own four-step invoice lifecycle; reached steps are filled. */
  life: (steps: string[], done: number) => (
    <div className="qa-life">
      {steps.map((t, i) => <div key={i} className={i < done ? "on" : ""}><b /><span>{t}</span></div>)}
    </div>
  ),
  // Square Dashboard primitives. The item table is the surface MGR maintains,
  // and its expandable rows are where the modelling problem lives: price belongs
  // to a variation, not to the item.
  filt: (chips: (string | [string, string])[], actions: [string, string?][] = []) => (
    <div className="sd-filt">
      <span className="sd-q">⌕ Search</span>
      {chips.map((c, i) => (Array.isArray(c) ? <span key={i}>{c[0]} <b>{c[1]}</b></span> : <span key={i}>{c}</span>))}
      <span className="sd-sp" />
      {actions.map(([t, k], i) => <span key={i} className={`sd-b ${k ?? ""}`}>{t}{k ? "" : " ▾"}</span>)}
    </div>
  ),
  items: (rows: [0 | 1, string, string, string, string, string, string, string][]) => (
    <div className="x-scroll">
      <table className="sd-t">
        <tbody>
          <tr>
            <th className="sd-x" /><th className="sd-ck"><b /></th><th className="sd-im" />
            {SQ_ITEM_COLS.map((h) => <th key={h}>{h}</th>)}
            <th className="sd-plus">+</th>
          </tr>
          {rows.map(([exp, name, cat, loc, sold, st, price, own], i) => (
            <tr key={i} className={own}>
              <td className="sd-x">{exp ? "›" : ""}</td>
              <td className="sd-ck"><b /></td>
              <td className="sd-im"><i /></td>
              <td>{name}</td><td>{cat}</td><td>{loc}</td><td>{sold}</td>
              <td><span className={`sd-pill${st === "Available" ? "" : " off"}`}>{st}</span></td>
              <td className="sd-pr">{price}</td>
              <td className="sd-plus" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
  txns: (rows: [string, string, string, string, string, (0 | 1)?][]) => (
    <div className="sd-tx">
      {rows.map((r, i) => (
        <div key={i} className={r[5] ? "on" : ""}>
          <i>{r[0]}</i><span>{r[1]}</span><b>{r[2]}</b><em>{r[4]}</em><u>{r[3]}</u>
        </div>
      ))}
    </div>
  ),
  hdr: (t: ReactNode, sb: ReactNode) => <div className="sd-hd">{t}<span>{sb}</span></div>,
  kpis: (arr: [string, string][]) => (
    <div className="sd-kpi">{arr.map(([a, b], i) => <div key={i}><b>{a}</b><span>{b} ⓘ</span></div>)}</div>
  ),
  day: (t: ReactNode, tot?: ReactNode) => <div className="sd-day">{t}<span>{tot ?? ""}</span></div>,
  // Square receipt primitives. A Square transaction is not a table: quantity is
  // a sub-line under the item, never a column.
  meta: (arr: [string, ReactNode][]) => (
    <div className="x-meta">
      {arr.map(([k, v], i) => (k ? <div key={i}><b>{k}</b>{v}</div> : <div key={i}>{v}</div>))}
    </div>
  ),
  sect: (t: ReactNode) => <div className="x-sect">{t}</div>,
  li: (arr: [ReactNode, ReactNode, ReactNode?][]) => (
    <div className="x-li">
      {arr.map(([n, amt, sub], i) => (
        <div key={i}>
          <div className="x-lr"><span>{n}</span><span>{amt}</span></div>
          {sub ? <div className="x-ls">{sub}</div> : null}
        </div>
      ))}
    </div>
  ),
};

// Chrome shared across Square frames, named so it cannot drift frame to frame.
export const sqItemFilters = (st = "Active") =>
  X.filt(["Category", ["Locations", "All"], ["Status", st], "≡ All filters"], [["Actions"], ["Create item", "p"]]);
const sqTxnFilters = () =>
  X.filt(["‹ Sep 2026 ›", "12:00 am – 12:00 am", "All Payment Methods", "All payments", "All Types", "Complete",
    "All locations", "All Sources", "All Team Members", "All Fees", "Card #", "⌕ Filter by card (last 4)"], [["Export"]]);
export const sqTxnHead = () => (
  <>
    {sqTxnFilters()}
    {X.hdr("Sep 1, 2026–Sep 30, 2026", "Reporting day (12:00 am - 11:59 pm EDT)")}
    {X.kpis([["93", "Complete transactions"], ["$1,564.63", "Total collected"], ["$1,272.00", "Net sales"]])}
  </>
);

// One nav vocabulary for both record venues: [label, depth, expandable]. The two
// products draw the same hierarchical list; only the chrome around it differs.
type VenueNavItem = [string, number, (0 | 1)?];
const navList = (items: VenueNavItem[], active: string) =>
  items.map(([t, d, x], i) => (
    <div key={i} className={`nv l${d}${t === active ? " on" : ""}`}>{t}{x ? <i>▾</i> : null}</div>
  ));

const QBO_RAIL: [string, string][] = [["Create", "+"], ["Bookmarks", "☆"], ["Home", "⌂"], ["Reports", "⎁"], ["All apps", "▦"]];
const QBO_APPS: VenueNavItem[] = [["Accounting", 1, 1], ["Expenses & Bills", 1, 1], ["Sales & Get Paid", 1, 1], ["Overview", 2],
  ["Sales transactions", 2], ["Invoices", 2], ["Payment links", 2], ["Recurring payments", 2], ["Sales orders", 2],
  ["Sales channels", 2], ["QuickBooks payouts", 2], ["Products & services", 2], ["Customer Hub", 1, 1],
  ["Inventory", 1, 1], ["Sales Tax", 1, 1]];

const QBO_BACKDROP_ROWS = [["9/3/26", "Invoice", "INV-1042", "Ridgeline Tap Room"], ["9/2/26", "Invoice", "INV-1041", "Al’s Bar"],
  ["9/2/26", "Invoice", "INV-1040", "Teresa’s"], ["9/1/26", "Invoice", "INV-1039", "Al’s Bar"],
  ["9/1/26", "Payment", "", "Ridgeline Tap Room"]];

/** QuickBooks: the Sales transactions list with a record open in the right panel — the only record shape it has. */
function QboFrame({ title, actions, selected, children }: { title: string; actions?: string; selected?: "receipt"; children: ReactNode }) {
  const backdropRows = selected === "receipt"
    ? [["9/3/26", "Sales receipt", "SR-1428", "Square customer"], ...QBO_BACKDROP_ROWS]
    : QBO_BACKDROP_ROWS;
  return (
    <div className="xf qbo qbopanel">
      <div className="xf-top">
        <span>Demo Brewing LLC</span>
        <i className="qb-search">Navigate. Find transactions, contacts, help, reports, and more.</i>
      </div>
      <div className="xf-main">
        <div className="qb-rail">
          <div className="qb-logo">qb</div>
          {QBO_RAIL.map(([l, g]) => <div key={l}><i>{g}</i>{l}</div>)}
        </div>
        <div className="nv-col qb-apps">
          <div className="nv-h">All apps</div>
          {navList(QBO_APPS, "Sales transactions")}
        </div>
        <div className="qp-back">
          <div className="qp-bh">Sales transactions</div>
          <div className="qp-kpi">
            {[["$0", "0 estimates"], ["$0", "Unbilled income"], ["$69K", "9 overdue invoices"], ["$113K", "14 open invoices"]]
              .map(([a, b]) => <div key={b}><b>{a}</b><span>{b}</span></div>)}
          </div>
          <div className="qp-filt">
            {["Batch actions", "All transactions", "Last 3 months", "All statuses", "Delivery method", "Errors"]
              .map((c) => <span key={c}>{c}</span>)}
          </div>
          <div className="qp-br hd"><span>Date</span><span>Type</span><span>No.</span><span>Customer</span></div>
          {backdropRows.map((r, i) => (
            <div key={i} className={`qp-br${i === 0 ? " on" : ""}`}>{r.map((c, j) => <span key={j}>{c}</span>)}</div>
          ))}
        </div>
        <div className="qa-panel">
          <div className="qa-top"><span>{title}</span><i>✕</i></div>
          <div className="qa-body">{children}</div>
          {actions && <div className="qa-ft"><span className="qa-b">More actions ▾</span><span className="qa-b p">{actions}</span></div>}
        </div>
      </div>
    </div>
  );
}

const SQ_PAY_NAV: VenueNavItem[] = [["Home", 1], ["Items & services", 1, 1], ["Payments & invoices", 1, 1], ["Transactions", 2],
  ["Orders", 2, 1], ["Invoices", 2, 1], ["Bill Pay", 2, 1], ["Virtual Terminal", 2, 1], ["Payment links", 2, 1],
  ["Subscriptions", 2], ["Disputes", 2], ["Risk Manager", 2, 1], ["Customers", 1], ["Reports", 1], ["Staff", 1],
  ["Banking", 1], ["What’s new", 1], ["Settings", 1], ["Add more", 1], ["Channels", 1], ["Online ordering", 1], ["Square Online", 1]];
const SQ_NAV: VenueNavItem[] = [["Items & services", 1, 1], ["Items", 2, 1], ["Item library", 3], ["Channel listings", 3],
  ["Service library", 3], ["Image library", 3], ["Resources", 3], ["Modifiers", 3], ["Categories", 3], ["Discounts", 3],
  ["Options", 3], ["Units", 3], ["Custom attributes", 3], ["Settings", 3, 1], ["Menus", 2], ["Inventory management", 2, 1],
  ["Order guide", 2], ["Gift Cards", 2, 1], ["Subscription plans", 2], ["Payments & invoices", 1, 1], ["Customers", 1],
  ["Reports", 1], ["Staff", 1], ["Banking", 1], ["What’s new", 1]];

/** Square Dashboard: identity in the sidebar, work in a filter row over a table. No top app bar — the real product has none. */
function SqDashFrame({ nav, on, panel, children }: { nav?: "pay"; on?: string; panel?: ReactNode; children: ReactNode }) {
  return (
    <div className="xf sqdash">
      <div className="xf-main">
        <div className="nv-col sd-nav">
          <div className="sd-brand"><b className="sd-logo">L</b><span>Demo Brewing LLC<i>$demobrewing</i></span></div>
          <div className="sd-search">Search</div>
          {navList(nav === "pay" ? SQ_PAY_NAV : SQ_NAV, on ?? "Item library")}
          <div className="sd-take">Take payment</div>
        </div>
        <div className="sd-main">{children}</div>
        {panel && (
          <div className="sd-panel">
            <div className="sd-pact"><span className="sd-b w">Send Receipt</span><span className="sd-b">⋯</span></div>
            <div className="sd-card">{panel}</div>
            <div className="sd-pft"><span className="sd-b p">Done</span></div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Three Slack shells, matching the three places MGR appears inside Slack. */
function SlackFrame({ shell, ctx, who, at, foot, children }: {
  shell: "home" | "msg" | "modal"; ctx?: string; who?: string; at?: string; foot?: [string, string?][]; children: ReactNode;
}) {
  if (shell === "home") {
    return (
      <div className="slk">
        <div className="slk-top"><span>MGR</span><i>{ctx ?? ""}</i></div>
        <div className="slk-tabs"><div>Messages</div><div className="on">Home</div><div>About</div></div>
        <div className="slk-body">{children}</div>
      </div>
    );
  }
  if (shell === "modal") {
    return (
      <div className="slk modal">
        <div className="slk-modtop"><span>{ctx}</span><i>✕</i></div>
        <div className="slk-body">{children}</div>
        <div className="slk-modft">{(foot ?? []).map(([l, k], i) => <span key={i} className={`sk-b ${k ?? ""}`}>{l}</span>)}</div>
      </div>
    );
  }
  return (
    <div className="slk">
      <div className="slk-top"><span>{ctx}</span><i>{who ?? ""}</i></div>
      <div className="slk-msg">
        <div className="slk-av">M</div>
        <div className="slk-mb">
          <div className="slk-mh"><b>MGR</b><span className="slk-badge">APP</span><span>{at ?? "8:42 AM"}</span></div>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Which product a frame is drawn inside, and the chrome that product needs. */
export type Venue =
  | { name: "QuickBooks Online"; title: string; actions?: string; selected?: "receipt" }
  | { name: "Square"; nav?: "pay"; on?: string; panel?: ReactNode }
  | { name: "Slack"; shell: "home" | "msg" | "modal"; ctx?: string; who?: string; at?: string; foot?: [string, string?][] };

/** Renders one venue frame in its own product's chrome. */
export function VenueFrame({ venue, children }: { venue: Venue; children: ReactNode }) {
  if (venue.name === "QuickBooks Online") return <QboFrame title={venue.title} actions={venue.actions} selected={venue.selected}>{children}</QboFrame>;
  if (venue.name === "Square") return <SqDashFrame nav={venue.nav} on={venue.on} panel={venue.panel}>{children}</SqDashFrame>;
  return <SlackFrame shell={venue.shell} ctx={venue.ctx} who={venue.who} at={venue.at} foot={venue.foot}>{children}</SlackFrame>;
}
