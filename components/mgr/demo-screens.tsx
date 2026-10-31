// components/mgr/demo-screens.tsx — personal screens redrawn for the explorer's
// chosen persona (lib/mgr/demo-personas.ts): Me, Slack preferences, and Permission denied for the screen the
// persona was just refused, and the vessel screens a non-admin reads without
// Add, New, Save or Delete vessel. Demo only: the inventory keeps its fixture
// drawings (Maria, "Invoices"); nothing under app/ imports this.
import { cloneElement, type ReactElement, type ComponentProps } from "react";
import { OrdersView } from "@/components/mgr/views/orders-list";
import { OrderView } from "@/components/mgr/views/order";
import { BatchesView } from "@/components/mgr/views/batches";
import { CellarMapView } from "@/components/mgr/views/cellar-map";
import { VesselDetailView } from "@/components/mgr/views/vessel-detail";
import { FinishedGoodsView } from "@/components/mgr/views/finished-goods";
import { ordersWorkList } from "@/lib/mgr/fixtures/orders";
import { toOrdersListViewProps } from "@/lib/mgr/orders-list-view";
import { E } from "@/components/mgr/e";
import type { Screen } from "@/components/mgr/screens";
import { UserAvatar } from "@/components/mgr/user-avatar";
import { MeView } from "@/components/mgr/views/me";
import { ChatPersonalPreferencesView } from "@/components/mgr/views/chat";
import { personalChatPreferences } from "@/lib/mgr/fixtures/chat";
import { needsFor, type Persona } from "@/lib/mgr/demo-personas";
import { hasAnyRole, onlyRoles } from "@/lib/mgr/roles";
import { ReceiptFixture } from "@/components/mgr/fixture-adapters";

const list = (xs: string[]) => (xs.length ? new Intl.ListFormat("en", { type: "disjunction" }).format(xs) : "admin");

/** `screen` as `persona` would see it; any other screen comes back untouched. */
export function asPersona(screen: Screen, persona: Persona, refused?: string): Screen {
  if (screen.name === "Receipt") {
    const body = screen.body as ReactElement<ComponentProps<typeof ReceiptFixture>>;
    return { ...screen, body: cloneElement(body, { roles: persona.roles }) };
  }
  if (screen.name === "Finished goods") {
    const body = screen.body as ReactElement<ComponentProps<typeof FinishedGoodsView>>;
    return { ...screen, body: cloneElement(body, { countHref: hasAnyRole(persona.roles, ["admin", "warehouse", "taproom"]) ? undefined : null }) };
  }
  if (screen.name === "Orders") {
    const canWrite = hasAnyRole(persona.roles, ["admin", "sales"]);
    const model = toOrdersListViewProps({ ...ordersWorkList, roles: persona.roles });
    // createAction: undefined keeps OrdersView's default New order button; null hides it.
    const body = screen.body as ReactElement<ComponentProps<typeof OrdersView>>;
    return { ...screen, body: cloneElement(body, { model, createAction: canWrite ? undefined : null }) };
  }
  if ((screen.name === "Order" || screen.name === "Order draft") && !hasAnyRole(persona.roles, ["admin", "sales"])) {
    const body = screen.body as ReactElement<ComponentProps<typeof OrderView>>;
    const model = { ...body.props.model, facts: body.props.model.facts.filter(fact => fact.label !== "Confirmation email") };
    return { ...screen, body: cloneElement(body, { model }) };
  }
  // Vessels are admin-managed: null hides Add vessel and New vessel; a brewer reads the facts.
  if (!hasAnyRole(persona.roles, ["admin"])) {
    if (screen.name === "Cellar map") {
      const body = screen.body as ReactElement<ComponentProps<typeof CellarMapView>>;
      return { ...screen, body: cloneElement(body, { model: { ...body.props.model, addHref: null } }) };
    }
    if (screen.name === "Batches") {
      const body = screen.body as ReactElement<ComponentProps<typeof BatchesView>>;
      return { ...screen, body: cloneElement(body, { newVesselHref: null }) };
    }
    if (screen.name === "Vessel detail") {
      const body = screen.body as ReactElement<ComponentProps<typeof VesselDetailView>>;
      return { ...screen, body: cloneElement(body, { editable: false }) };
    }
  }
  if (screen.name === "My notification preferences") {
    return { ...screen, body: <ChatPersonalPreferencesView preferences={personalChatPreferences} canSetQuietHours={!onlyRoles(persona.roles, ["taproom"])} back={hasAnyRole(persona.roles, ["admin"]) ? "Chat" : "More"} /> };
  }
  if (screen.name === "Me") {
    return {
      ...screen,
      body: <MeView
        model={{
          name: persona.name,
          roles: persona.roles,
          email: `${persona.handle.slice(1)}@demobrewing.com`,
          breweries: [{ name: "Demo Brewing", current: true }],
        }}
        avatar={<UserAvatar src={persona.avatar} name={persona.name} className="size-10" />}
      />,
    };
  }
  if (screen.name === "Permission denied" && refused) {
    return {
      ...screen,
      body: (
        <>
          {E.back("Today", "No access")}
          {E.note(`You do not have access to ${refused}.`)}
          {E.fld("Signed in as", `${persona.handle} · ${persona.roles.join(", ")}`)}
          {E.fld("Needs", list(needsFor(refused)))}
          {E.info("An admin can change your role in Settings, then Team.")}
          {E.btns([["Back to Today", "p"]])}
          {E.sp()}
        </>
      ),
    };
  }
  return screen;
}
