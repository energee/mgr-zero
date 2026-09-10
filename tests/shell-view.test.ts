// tests/shell-view.test.ts — Today, Beer, Work, More, Search, Me, Settings,
// Team, Permission denied, First-run, and entry inventory adapters plus HTML.
// Views own no sample data. Live CommandForm / MeSheet / LoginForm / Entry
// cards stay wrappers.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { ScreenFrame, ScreenSheet } from "../components/mgr/screen-frame";
import { MeSheet } from "../components/mgr/me-sheet";
import { EntrySurface } from "../components/mgr/entry-surface";
import { BeerView } from "../components/mgr/views/beer";
import { DeniedView } from "../components/mgr/views/denied";
import { EntryView } from "../components/mgr/views/entry";
import { FirstRunView } from "../components/mgr/views/first-run";
import { MeView } from "../components/mgr/views/me";
import { MoreView } from "../components/mgr/views/more";
import { SearchView } from "../components/mgr/views/search";
import { SessionExpiredView } from "../components/mgr/views/session-expired";
import { SettingsView } from "../components/mgr/views/settings";
import { TeamView } from "../components/mgr/views/team";
import { TodayView } from "../components/mgr/views/today";
import { WorkView } from "../components/mgr/views/work";
import { beerOverview } from "../lib/mgr/fixtures/beer";
import { deniedInvoices } from "../lib/mgr/fixtures/denied";
import {
  expiredReset,
  noMembership,
  portalForgotPassword,
  portalSetPassword,
  portalSignIn,
  resetPassword,
  setPassword,
  signIn,
} from "../lib/mgr/fixtures/entry";
import { firstRunDemo } from "../lib/mgr/fixtures/first-run";
import { meMaria } from "../lib/mgr/fixtures/me";
import { moreNavs } from "../lib/mgr/fixtures/more";
import { entityPickerPalette, searchPalette } from "../lib/mgr/fixtures/search";
import { sessionExpiredQueued } from "../lib/mgr/fixtures/session-expired";
import { settingsDemo } from "../lib/mgr/fixtures/settings";
import { teamRoster } from "../lib/mgr/fixtures/team";
import {
  todayBrewer,
  todayDriver,
  todayEmpty,
  todaySales,
  todayTaproom,
  todayWarehouse,
} from "../lib/mgr/fixtures/today";
import { workWarehouse } from "../lib/mgr/fixtures/work";
import { toBeerViewProps } from "../lib/mgr/beer-view";
import { toDeniedViewProps } from "../lib/mgr/denied-view";
import { toEntryViewProps } from "../lib/mgr/entry-view";
import { toFirstRunViewProps } from "../lib/mgr/first-run-view";
import { toMeViewProps } from "../lib/mgr/me-view";
import { toMoreViewProps } from "../lib/mgr/more-view";
import { toSearchViewProps } from "../lib/mgr/search-view";
import { toSessionExpiredViewProps } from "../lib/mgr/session-expired-view";
import { toSettingsViewProps } from "../lib/mgr/settings-view";
import { toTeamViewProps } from "../lib/mgr/team-view";
import { toTodayViewProps } from "../lib/mgr/today-view";
import { toWorkViewProps } from "../lib/mgr/work-view";
import { plural } from "../lib/mgr/plural";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;
const src = (file: string) => readFileSync(file, "utf8");

describe("Entry surface", () => {
  it("uses the shared surface for inventory entry screens", () => {
    expect(ScreenFrame({ screen: screen("Sign in") }).type).toBe(EntrySurface);
  });
});

describe("Today view", () => {
  it("maps warehouse rows onto Pick / Put back / Receive / Resume", () => {
    const model = toTodayViewProps(todayWarehouse);
    expect(model.rows.map((r) => [r.title, r.verb])).toEqual([
      ["3 orders ready", "Pick"],
      ["Staged · ORD-0229", "Put back"],
      ["PO-0142 · Country Malt", "Receive"],
      ["Next delivery · Ridgeline", "Resume"],
    ]);
    expect(model.date).toBe("Thu 9/3");
  });

  it("names an empty list without inventing rows", () => {
    const model = toTodayViewProps(todayEmpty);
    expect(model.empty).toBe("Nothing waiting");
    expect(model.emptyVerb).toBe("Record movement");
    expect(model.rows).toEqual([]);
  });

  it("maps get_today items through TODAY_VERB without inventing labels", () => {
    const model = toTodayViewProps({
      date: "Fri 9/4",
      items: [{
        reason: "pick_due",
        subjectType: "order",
        subjectId: "o1",
        sourceVersion: "1",
        safeLabel: "ORD-1",
        detail: "due now",
        dueAt: null,
        href: "/orders/o1",
        recipientRoles: ["warehouse"],
        assignedUserId: null,
      }],
    });
    expect(model.rows).toEqual([
      {
        key: "pick_due:o1",
        title: "ORD-1",
        detail: "due now",
        verb: "Pick",
        tone: "info",
        href: "/orders/o1",
        warning: true,
        icon: "package",
      },
    ]);
  });

  it("the inventory drawings still offer the persona verbs", () => {
    expect(htmlOf(screen("Today").body)).toMatch(/>Pick</);
    expect(htmlOf(screen("Today empty").body)).toMatch(/>Record movement</);
    expect(htmlOf(screen("Sales").body)).toMatch(/>Confirm</);
    expect(htmlOf(screen("Brewer").body)).toMatch(/>Start</);
    expect(htmlOf(screen("Driver").body)).toMatch(/Resume/);
    expect(htmlOf(screen("Taproom").body)).toMatch(/>Open</);
    expect(htmlOf(screen("Today").body)).not.toMatch(/href="\/orders/);
  });

  it("emptyAction and linkRows slot for live Today", () => {
    const html = htmlOf(createElement(TodayView, {
      model: toTodayViewProps(todayEmpty),
      emptyAction: "MOVE",
      linkRows: true,
    }));
    expect(html).toMatch(/MOVE/);
    expect(html).not.toMatch(/>Record movement</);
  });

  it.each([
    ["Today", TodayView, todayWarehouse],
    ["Today empty", TodayView, todayEmpty],
    ["Sales", TodayView, todaySales],
    ["Brewer", TodayView, todayBrewer],
    ["Driver", TodayView, todayDriver],
    ["Taproom", TodayView, todayTaproom],
  ] as const)("the %s inventory record is TodayView", (name, view, fixture) => {
    const body = screen(name).body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen(name).body)).toBe(true);
    expect(body.type).toBe(view);
    expect(body.props.model).toEqual(toTodayViewProps(fixture));
  });

  it("the live Today page mounts TodayView", () => {
    const page = src("app/(app)/page.tsx");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/today"/);
    expect(page).toMatch(/<TodayView\b/);
    expect(page).toMatch(/FirstRunChecklist/);
  });
});

describe("Beer view", () => {
  it("maps overview counts onto area rows", () => {
    const model = toBeerViewProps({
      overview: {
        fgShortages: 2,
        taproomBelowPar: 1,
        openTaps: 11,
        openOccupancies: 6,
        materialShortages: 3,
        kegsOut: 142,
      },
      showTaproom: true,
    });
    expect(model.navs.map((r) => [r.title, r.detail])).toEqual([
      ["Finished goods", `${plural(2, "shortage")} · ATP by SKU`],
      ["Taproom", `${plural(1, "SKU")} below par · weekly count`],
      ["Taps", `${plural(11, "keg")} open · Tap board`],
      ["Cellar", `${plural(6, "tank")} with beer`],
      ["Materials", plural(3, "shortage")],
      ["Kegs", "142 out at customers"],
    ]);
  });

  it("omits Taproom and Taps when showTaproom is false", () => {
    const model = toBeerViewProps({
      overview: {
        fgShortages: 0,
        taproomBelowPar: 0,
        openTaps: 0,
        openOccupancies: 0,
        materialShortages: 0,
        kegsOut: 0,
      },
      showTaproom: false,
    });
    expect(model.navs.map((r) => r.title)).toEqual(["Finished goods", "Cellar", "Materials", "Kegs"]);
  });

  it("the inventory drawing still offers Finished goods and does not leak live hrefs", () => {
    const html = htmlOf(createElement(BeerView, { model: toBeerViewProps(beerOverview) }));
    expect(html).toMatch(/Finished goods/);
    expect(html).toMatch(/ATP by SKU/);
    expect(html).not.toMatch(/href="\/inventory"/);
  });

  it("the Beer inventory record is BeerView", () => {
    const body = screen("Beer").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(BeerView);
    expect(body.props.model).toEqual(toBeerViewProps(beerOverview));
  });

  it("the live Beer page mounts BeerView", () => {
    const page = src("app/(app)/beer/page.tsx");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/beer"/);
    expect(page).toMatch(/<BeerView\b/);
  });
});

describe("Work view", () => {
  it("maps warehouse work rows and chips", () => {
    const model = toWorkViewProps(workWarehouse);
    expect(model.subtitle).toBe("warehouse default");
    expect(model.rows[0]?.verb).toBe("Confirm");
    expect(model.workChips[0]).toBe("all");
  });

  it("the Work inventory record is WorkView", () => {
    const body = screen("Work").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(WorkView);
    expect(body.props.model).toEqual(toWorkViewProps(workWarehouse));
  });

  it("the live Work page mounts WorkView and slots WorkList", () => {
    const page = src("app/(app)/work/page.tsx");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/work"/);
    expect(page).toMatch(/<WorkView\b/);
    expect(page).toMatch(/<WorkList\b/);
  });
});

describe("More view", () => {
  it("maps the designed More list", () => {
    const model = toMoreViewProps(moreNavs);
    expect(model.navs[0]?.title).toBe("Invoices");
    expect(model.navs.some((r) => r.title === "Settings")).toBe(true);
  });

  it("the More inventory record is MoreView", () => {
    const body = screen("More").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(MoreView);
    expect(body.props.model).toEqual(toMoreViewProps(moreNavs));
  });

  it("the live More page mounts MoreView with no second E.* tree", () => {
    const page = src("app/(app)/more/page.tsx");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/more"/);
    expect(page).toMatch(/<MoreView\b/);
    expect(page).not.toMatch(/from "@\/components\/mgr\/e"/);
  });
});

describe("Search view", () => {
  it("the Search inventory record is SearchView", () => {
    const body = screen("Search").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(SearchView);
    expect(body.props.model).toEqual(toSearchViewProps(searchPalette));
  });

  it("the Entity picker inventory record is SearchView", () => {
    const body = screen("Entity picker").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(SearchView);
    expect(body.props.model).toEqual(toSearchViewProps(entityPickerPalette));
  });

  it("the live Search page mounts SearchView and slots SearchPalette", () => {
    const page = src("app/(app)/search/page.tsx");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/search"/);
    expect(page).toMatch(/<SearchView\b/);
    expect(page).toMatch(/<SearchPalette\b/);
  });
});

describe("Me view", () => {
  it("the Me inventory record is MeView", () => {
    const body = screen("Me").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(MeView);
    expect(body.props.model).toEqual(toMeViewProps(meMaria));
  });

  it("live staff and portal Me use the inventory views in the shared centered dialog", () => {
    const dialog = src("components/mgr/me-sheet.tsx");
    const staff = src("app/(app)/layout.tsx");
    const portal = src("app/(portal)/layout.tsx");
    const personas = src("components/mgr/demo-screens.tsx");
    expect(dialog).toMatch(/export function MeSheet/);
    expect(dialog).toMatch(/from "@\/components\/ui\/dialog"/);
    expect(dialog).toMatch(/<DialogContent\b/);
    expect(dialog).not.toMatch(/from "@\/components\/ui\/sheet"/);
    expect(dialog).not.toMatch(/useIsMobile/);
    expect(staff).toMatch(/<MeView\b/);
    expect(portal).toMatch(/<PortalMeView\b/);
    expect(personas).toMatch(/<MeView\b/);
  });

  it.each(["Me", "Portal Me"])("the %s inventory uses the shared Me dialog surface", (name) => {
    const surface = ScreenSheet({ screen: screen(name) });
    expect(surface.type).toBe(MeSheet);
  });
});

describe("Settings view", () => {
  it("the Settings inventory record is SettingsView", () => {
    const body = screen("Settings").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(SettingsView);
    expect(body.props.model).toEqual(toSettingsViewProps(settingsDemo));
  });

  it("the live Settings page mounts SettingsView and slots the forms", () => {
    const page = src("app/(app)/settings/page.tsx");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/settings"/);
    expect(page).toMatch(/<SettingsView\b/);
    expect(page).toMatch(/<SettingsForm\b/);
    expect(page).toMatch(/<PortalFulfillmentForm\b/);
  });
});

describe("Team view", () => {
  it("the Team inventory record is TeamView", () => {
    const body = screen("Team").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(TeamView);
    expect(body.props.model).toEqual(toTeamViewProps(teamRoster));
  });

  it("the live Team page mounts TeamView and slots MemberForm / InviteForm", () => {
    const page = src("app/(app)/settings/team/page.tsx");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/team"/);
    expect(page).toMatch(/<TeamView\b/);
    expect(page).toMatch(/<MemberForm\b/);
    expect(page).toMatch(/<InviteForm\b/);
  });
});

describe("Permission denied view", () => {
  it("maps deniedCopy onto the three lines", () => {
    const model = toDeniedViewProps(deniedInvoices);
    expect(model.note).toBe("You do not have access to Invoices.");
    expect(model.needs).toBe("admin or sales");
  });

  it("the Permission denied inventory record is DeniedView", () => {
    const body = screen("Permission denied").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(DeniedView);
    expect(body.props.model).toEqual(toDeniedViewProps(deniedInvoices));
  });

  it("the live denied page mounts DeniedView", () => {
    const page = src("app/(app)/denied/page.tsx");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/denied"/);
    expect(page).toMatch(/<DeniedView\b/);
  });
});

describe("First-run view", () => {
  it("the First-run checklist inventory record is FirstRunView", () => {
    const body = screen("First-run checklist").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(FirstRunView);
    expect(body.props.model).toEqual(toFirstRunViewProps(firstRunDemo));
  });

  it("the live first-run checklist mounts FirstRunView", () => {
    const page = src("app/(app)/first-run.tsx");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/first-run"/);
    expect(page).toMatch(/<FirstRunView\b/);
  });
});

describe("Entry views", () => {
  it.each([
    ["Sign in", signIn],
    ["Reset password", resetPassword],
    ["Set new password", setPassword],
    ["Portal sign in", portalSignIn],
    ["Portal forgot password", portalForgotPassword],
    ["Portal set password", portalSetPassword],
    ["No membership", noMembership],
    ["Expired reset", expiredReset],
  ] as const)("the %s inventory record is EntryView", (name, fixture) => {
    const body = screen(name).body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(EntryView);
    expect(body.props.model).toEqual(toEntryViewProps(fixture));
  });

  it("the Session expired inventory record is SessionExpiredView", () => {
    const body = screen("Session expired").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(SessionExpiredView);
    expect(body.props.model).toEqual(toSessionExpiredViewProps(sessionExpiredQueued));
  });

  it("live sign-in and session expiry stay LoginForm", () => {
    const page = src("app/(auth)/login/page.tsx");
    expect(page).toMatch(/LoginForm/);
    expect(page).not.toMatch(/EntryView/);
    expect(page).not.toMatch(/SessionExpiredView/);
  });
});
