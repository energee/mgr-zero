// tests/settings-integrations-ux.test.ts — #1509: single-pick settings and
// Square mappings save on change, connect and disconnect stay on the parent
// page, one Sync Square, one Save and publish, Slack channels load on mount, and
// Import skips Match columns when every column already matches by name.
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { E } from "@/components/mgr/e";
import { AiModelSettingsView } from "@/components/mgr/views/ai-model-settings";
import { PortalFulfillmentView } from "@/components/mgr/views/portal-fulfillment";
import { AiModelSettingsForm } from "@/app/(app)/settings/ai-model-settings-form";
import { PortalFulfillmentForm } from "@/app/(app)/settings/portal-fulfillment-form";
import { settingsDemo } from "@/lib/mgr/fixtures/settings";
import { ImportView } from "@/components/mgr/views/import";
import { IMPORT_FIELDS } from "@/lib/import-csv";
import { importPreview } from "@/lib/mgr/fixtures/import";
import { PointOfSaleView, PosItemView, PosMenuView, PosSyncActions, SquareLocationsView } from "@/components/mgr/views/pos";
import { PosItemControl, SquareDisconnectControl, SquareSyncControls } from "@/components/mgr/views/pos-controls";
import { QboDisconnectAction } from "@/app/(app)/settings/accounting/qbo-controls";
import { ChatDeliveryView, ChatLinkedPeopleView, ChatSettingsFieldsView, ChatSettingsView } from "@/components/mgr/views/chat";
import { ChatSettingsControls } from "@/app/(app)/settings/chat/chat-settings-client";
import { chatConnected, linkedChatPeople } from "@/lib/mgr/fixtures/chat";

const action = vi.hoisted(() => ({ busy: false, error: null, succeeded: null, failure: null, fieldErrors: {}, setError: () => {}, run: vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true) }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandAction: () => action }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/" }));

/** Renders `make` inside a component, so its hooks run, and returns what it drew. */
function capture<T extends ReactElement>(make: () => T): T {
  let element: T | undefined;
  function Capture() { element = make(); return element; }
  renderToStaticMarkup(createElement(Capture));
  return element!;
}

describe("single-pick settings save on select (#1509 item 2)", () => {
  const models = settingsDemo.aiModels;

  it("draws the AI model with no Save AI model button or form", () => {
    const html = renderToStaticMarkup(createElement(AiModelSettingsView, { value: models[0].id, models, onChange: vi.fn() }));
    expect(html).not.toContain("Save AI model");
    expect(html).not.toContain("<form");
  });

  it("saves a picked AI model at once and skips the saved one", () => {
    action.run.mockClear();
    const view = capture(() => AiModelSettingsForm({ current: models[0].id, models }) as ReactElement<{ onChange: (value: string) => void }>);
    view.props.onChange(models[0].id);
    expect(action.run).not.toHaveBeenCalled();
    view.props.onChange(models[1].id);
    expect(action.run).toHaveBeenCalledWith("set_brewery_ai_model", { model: models[1].id }, expect.any(Function));
  });

  it("draws the warehouse with no Save warehouse button and saves the picked one", () => {
    const pick = vi.spyOn(E, "pick");
    try {
      const onSave = vi.fn(async () => true);
      const html = renderToStaticMarkup(createElement(PortalFulfillmentView, { locations: [...settingsDemo.warehouseOptions, { id: "second", name: "Second" }], currentId: settingsDemo.warehouseId, onSave }));
      expect(html).not.toContain("Save warehouse");
      expect(html).not.toContain("<form");
      const onChange = pick.mock.calls.at(-1)![3]!.onChange!;
      onChange(settingsDemo.warehouseId!);
      expect(onSave).not.toHaveBeenCalled();
      onChange("second");
      expect(onSave).toHaveBeenCalledWith("second");
    } finally { pick.mockRestore(); }
  });

  it("sends the picked warehouse through set_portal_fulfillment_source", async () => {
    action.run.mockClear();
    const view = capture(() => PortalFulfillmentForm({ locations: settingsDemo.warehouseOptions, currentId: null }) as ReactElement<{ onSave: (id: string) => Promise<boolean> }>);
    expect(await view.props.onSave("loc")).toBe(true);
    expect(action.run).toHaveBeenCalledWith("set_portal_fulfillment_source", { locationId: "loc" });
  });
});

/** The first clickable element in `node` whose own text is `label`; it walks
 *  props.children only, so it sees what a view draws without rendering children. */
function findButton(node: ReactNode, label: string): ReactElement<{ onClick: () => void }> | undefined {
  if (Array.isArray(node)) return node.map(child => findButton(child, label)).find(Boolean);
  if (!isValidElement<{ children?: ReactNode; onClick?: unknown }>(node)) return undefined;
  const children = node.props.children;
  const own = Array.isArray(children) ? children.join("") : children;
  if (own === label && typeof node.props.onClick === "function") return node as ReactElement<{ onClick: () => void }>;
  return findButton(children, label);
}

describe("Import skips Match columns when every column matched by name (#1509 item 1)", () => {
  const headers = IMPORT_FIELDS.customers.map(field => field.name);
  const matched = Object.fromEntries(headers.map((name, index) => [name, index]));
  const upload = (mapping: Record<string, number>, onStep = vi.fn()) => capture(() => ImportView({ model: { ...importPreview, step: 0, headers, csvRowCount: 3, mapping }, onStep }) as ReactElement);

  it("offers Review N rows and a Columns differ? way back to matching", () => {
    const onStep = vi.fn();
    const view = upload(matched, onStep);
    findButton(view, "Review 3 rows")!.props.onClick();
    expect(onStep).toHaveBeenLastCalledWith(2);
    findButton(view, "Columns differ?")!.props.onClick();
    expect(onStep).toHaveBeenLastCalledWith(1);
    expect(findButton(view, "Match columns")).toBeUndefined();
  });

  it("keeps Match columns as the next step while a required column is unmatched", () => {
    const onStep = vi.fn();
    const view = upload({}, onStep);
    findButton(view, "Match columns")!.props.onClick();
    expect(onStep).toHaveBeenLastCalledWith(1);
    expect(findButton(view, "Columns differ?")).toBeUndefined();
  });
});

describe("Square: one Sync Square, mappings save on pick (#1509 item 5)", () => {
  const locationRow = { externalLocationId: "square-tap", name: "Square Taproom", detail: "active", mgrLocationId: "taproom" };
  const variation = { externalItemId: "i", externalVariationId: "v", label: "Guest cider · pint", detail: "Sold in Square · not from MGR", disposition: "queued" as const, target: "" };
  const menu = { locations: [], selectedLocationId: "taproom", locationName: "Taproom", binName: "Cold", channelName: "Taproom", items: [], excluded: [], externalItems: [variation] };

  it("draws one Sync Square button", () => {
    const html = renderToStaticMarkup(createElement(PosSyncActions));
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain(">Sync Square</button>");
  });

  it("syncs the catalog, then sales, from the one button", async () => {
    action.run.mockClear();
    const view = capture(() => SquareSyncControls() as ReactElement<{ onSync: () => Promise<void> }>);
    await view.props.onSync();
    expect(action.run.mock.calls.map(call => call[0])).toEqual(["sync_square_catalog", "sync_square_sales"]);
  });

  it("skips the sales sync when the catalog sync fails", async () => {
    action.run.mockClear();
    action.run.mockResolvedValueOnce(false);
    const view = capture(() => SquareSyncControls() as ReactElement<{ onSync: () => Promise<void> }>);
    await view.props.onSync();
    expect(action.run.mock.calls.map(call => call[0])).toEqual(["sync_square_catalog"]);
  });

  it("saves a Square location mapping when an MGR location is picked", () => {
    const pick = vi.spyOn(E, "pick");
    try {
      const onSave = vi.fn(async () => true);
      const html = renderToStaticMarkup(createElement(SquareLocationsView, { rows: [locationRow], locations: [{ id: "taproom", name: "Taproom" }, { id: "warehouse", name: "Warehouse" }], onSave }));
      expect(html).not.toContain("Save mapping");
      pick.mock.calls.at(-1)![3]!.onChange!("warehouse");
      expect(onSave).toHaveBeenCalledWith(locationRow, "warehouse");
    } finally { pick.mockRestore(); }
  });

  it("saves an Also in Square mapping when a target is picked", () => {
    const pick = vi.spyOn(E, "pick");
    try {
      const onMap = vi.fn(async () => true);
      const html = renderToStaticMarkup(createElement(PosMenuView, { model: menu, targets: [{ value: "format:pint", label: "Pour · House · pint" }], onMap }));
      expect(html).not.toMatch(/Save mapping|Change mapping/);
      pick.mock.calls.at(-1)![3]!.onChange!("format:pint");
      expect(onMap).toHaveBeenCalledWith(variation, "format:pint");
    } finally { pick.mockRestore(); }
  });
});

describe("Menu item: one Save and publish (#1509 item 6)", () => {
  const item = { brand: "Hazy", format: "Pint", sources: "", serving: "16 oz", price: "$7.00", override: "", websitePublished: false, available: true };

  it("draws one Save and publish verb in place of Save override and Publish item to Square", () => {
    const html = renderToStaticMarkup(createElement(PosItemView, { item }));
    expect(html).toContain(">Save and publish</button>");
    expect(html).not.toMatch(/Save override|Publish item to Square/);
  });

  it("saves the price override, then publishes the item", async () => {
    action.run.mockClear();
    const view = capture(() => PosItemControl({ posLocationId: "L1", brandId: "b1", formatId: "f1", item }) as ReactElement<{ onSave: (value: string) => Promise<void> }>);
    await view.props.onSave("8.50");
    expect(action.run.mock.calls.map(call => call[0])).toEqual(["set_pos_price_override", "publish_pos_item"]);
    expect(action.run.mock.calls[0][1]).toEqual({ posLocationId: "L1", formatId: "f1", brandId: "b1", unitPriceCents: 850 });
  });

  it("does not publish when the price save fails", async () => {
    action.run.mockClear();
    action.run.mockResolvedValueOnce(false);
    const view = capture(() => PosItemControl({ posLocationId: "L1", brandId: "b1", formatId: "f1", item }) as ReactElement<{ onSave: (value: string) => Promise<void> }>);
    await view.props.onSave("8.50");
    expect(action.run.mock.calls.map(call => call[0])).toEqual(["set_pos_price_override"]);
  });
});

/** The first element in `node` carrying a function prop `name`; walks props.children only. */
function findWithProp<P>(node: ReactNode, name: string): ReactElement<P> | undefined {
  if (Array.isArray(node)) return node.map(child => findWithProp<P>(child, name)).find(Boolean);
  if (!isValidElement<Record<string, unknown> & { children?: ReactNode }>(node)) return undefined;
  if (typeof node.props[name] === "function") return node as ReactElement<P>;
  return findWithProp<P>(node.props.children, name);
}

describe("Connect and Disconnect stay on Accounting and Point of sale (#1509 item 3)", () => {
  const routes = ["app/(app)/settings/accounting/connect/page.tsx", "app/(app)/settings/accounting/disconnect/page.tsx", "app/(app)/settings/pos/connect/page.tsx", "app/(app)/settings/pos/disconnect/page.tsx"];

  it("has no connect or disconnect pages for QuickBooks or Square, and nothing links them", () => {
    for (const route of routes) expect(existsSync(route), route).toBe(false);
    const sources = ["app/(app)/invoices/page.tsx", "app/(app)/settings/accounting/page.tsx", "app/(app)/settings/accounting/qbo-controls.tsx", "app/(app)/settings/pos/page.tsx", "components/mgr/views/pos-controls.tsx", "lib/mgr/nav.ts", "lib/mgr/screen-routes.ts"];
    for (const file of sources) expect(readFileSync(file, "utf8"), file).not.toMatch(/\/settings\/(accounting|pos)\/(connect|disconnect)\b/);
  });

  it("draws Connect Square on Point of sale itself", () => {
    const html = renderToStaticMarkup(createElement(PointOfSaleView, { model: { connected: false, configured: true, merchant: "", state: "Not connected" } }));
    expect(html).toMatch(/<button[^>]*>Connect Square<\/button>/);
  });

  it("disconnects QuickBooks from a dialog and stays on Accounting", () => {
    action.run.mockClear();
    const dialog = capture(() => QboDisconnectAction({ connectionId: "qbo-1" }) as ReactElement<{ trigger: ReactNode; title: string }>);
    expect(dialog.props.title).toBe("Disconnect QuickBooks");
    expect(renderToStaticMarkup(dialog.props.trigger as ReactElement)).toContain(">Disconnect</button>");
    findWithProp<{ onDisconnect: () => void }>(dialog, "onDisconnect")!.props.onDisconnect();
    expect(action.run).toHaveBeenCalledWith("disconnect_qbo", { connectionId: "qbo-1" }, expect.any(Function));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("disconnects Square from a dialog and stays on Point of sale", () => {
    action.run.mockClear();
    const dialog = capture(() => SquareDisconnectControl({ connectionId: "sq-1", status: "unresolved" }) as ReactElement<{ trigger: ReactNode; title: string }>);
    expect(dialog.props.title).toBe("Disconnect Square");
    expect(renderToStaticMarkup(dialog.props.trigger as ReactElement)).toContain(">Disconnect</button>");
    findWithProp<{ onDisconnect: () => void }>(dialog, "onDisconnect")!.props.onDisconnect();
    expect(action.run).toHaveBeenCalledWith("disconnect_square", { connectionId: "sq-1" }, expect.any(Function));
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("Slack: channels load with the page and save on pick (#1509 item 4)", () => {
  const installation = chatConnected.installation!;
  const channels = [{ id: "COPS", name: "mgr-operations" }, { id: "CTWO", name: "mgr-two" }];
  const fields = { installation, timezone: "UTC", hours: "24", initialHours: 24, start: "21:00", end: "06:00", channel: "COPS" };

  it("draws loaded channels with no Load or Save button, and offers Load only when none loaded", () => {
    const loaded = renderToStaticMarkup(createElement(ChatSettingsFieldsView, { ...fields, channels }));
    expect(loaded).not.toMatch(/Load private channels|Save operations channel/);
    expect(renderToStaticMarkup(createElement(ChatSettingsFieldsView, { ...fields, channels: null }))).toContain(">Load private channels</button>");
    expect(renderToStaticMarkup(createElement(ChatSettingsFieldsView, { ...fields, channels: [] }))).toContain(">Load private channels</button>");
  });

  it("saves a picked operations channel at once", () => {
    action.run.mockClear();
    const view = capture(() => ChatSettingsControls({ installation, timezone: "UTC", configured: true, channels, channel: "COPS" }) as ReactElement<{ onChannel: (value: string) => void }>);
    view.props.onChannel("COPS");
    expect(action.run).not.toHaveBeenCalled();
    view.props.onChannel("CTWO");
    expect(action.run).toHaveBeenCalledWith("set_notification_destination", { installationId: installation.id, externalDestinationId: "CTWO" }, expect.any(Function));
  });

  it("reads the private channels on the server when Slack is active", () => {
    const page = readFileSync("app/(app)/settings/chat/page.tsx", "utf8");
    expect(page).toMatch(/optionalPageQuery<[^>]*>\("list_chat_channels"/);
  });

  it("keeps one delivery control: the switch, with no Disable integration beside it", () => {
    const html = renderToStaticMarkup(createElement(ChatDeliveryView, { enabled: true, onDisable: vi.fn() }));
    expect(html).toContain('aria-label="Slack delivery"');
    expect(html).not.toContain("Disable integration");
  });
});

describe("Linked people on Chat, with linking and unlinking together (#1509 item 8)", () => {
  it("draws linked people inside Chat settings, not as a separate page", () => {
    const html = renderToStaticMarkup(createElement(ChatSettingsView, { health: chatConnected, timezone: "UTC", readingDueHours: 24, people: createElement(ChatLinkedPeopleView, { people: linkedChatPeople, timeZone: "UTC" }) }));
    expect(html).toContain("Avery Stone");
    expect(html).toContain(">Unlink</button>");
    expect(existsSync("app/(app)/settings/chat/people/page.tsx")).toBe(false);
  });

  it("says how to link from Slack instead of opening the link page without a proof", () => {
    const html = renderToStaticMarkup(createElement(ChatLinkedPeopleView, { people: [], timeZone: "UTC" }));
    expect(html).toContain("Link MGR account");
    expect(html).not.toContain("Link your Slack");
    // Slack App Home hands out the consent link with its proof; MGR pages never link it bare.
    for (const file of ["app/(app)/settings/chat/page.tsx", "app/(app)/settings/chat/chat-settings-client.tsx"]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/\/settings\/chat\/(people|link)\b/);
    }
    for (const file of ["lib/mgr/screen-routes.ts", "lib/mgr/nav.ts"]) expect(readFileSync(file, "utf8"), file).not.toContain("/settings/chat/people");
  });
});
