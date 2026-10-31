// tests/standing-help.test.ts — #1518: notes that repeat on every visit are
// gone, shortened, or shown only when they apply. Each case names the screen
// and what the reader still sees (a field error, a column header, the form
// that changes the value) after the note is removed.
import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NewOrderView } from "@/components/mgr/views/new-order";
import { EditDraftOrderView } from "@/components/mgr/views/edit-draft-order";
import { PriceGroupView } from "@/components/mgr/views/price-group";
import { BrandView } from "@/components/mgr/views/brand";
import { CustomerView } from "@/components/mgr/views/customer";
import { QboDefaultsView } from "@/components/mgr/views/accounting";
import { SaleChannelsView } from "@/components/mgr/views/sale-channels";
import { ChannelView } from "@/components/mgr/views/channel";
import { TaproomVarianceView } from "@/components/mgr/views/taproom-variance";
import { InventoryDetailView } from "@/components/mgr/views/inventory-detail";
import { RecipeView } from "@/components/mgr/views/recipe";
import { SchedulePackagingRunView } from "@/components/mgr/views/schedule-packaging-run";
import { CellarTransferView } from "@/components/mgr/views/cellar-transfer";
import { newOrderDraft } from "@/lib/mgr/fixtures/orders";
import { editDraftOrder } from "@/lib/mgr/fixtures/edit-draft-order";
import { pricingGrid } from "@/lib/mgr/fixtures/pricing";
import { brandHazy } from "@/lib/mgr/fixtures/catalog";
import { customerRidgeline } from "@/lib/mgr/fixtures/customers";
import { channelExport, saleChannelsList } from "@/lib/mgr/fixtures/settings-catalog";
import { taproomVariance } from "@/lib/mgr/fixtures/taproom";
import { INVENTORY_DETAIL } from "@/lib/mgr/fixtures/inventory-detail";
import { schedulePackagingRun } from "@/lib/mgr/fixtures/packaging";
import { cellarTransferPils } from "@/lib/mgr/fixtures/production";
import { toNewOrderViewProps } from "@/lib/mgr/new-order-view";
import { toPriceGroupViewProps } from "@/lib/mgr/price-group-view";
import { toBrandViewProps } from "@/lib/mgr/brand-view";
import { CUSTOMER_ALIAS_HELP, toCustomerViewProps } from "@/lib/mgr/customer-view";
import { toSaleChannelsViewProps } from "@/lib/mgr/sale-channels-view";
import { toChannelViewProps } from "@/lib/mgr/channel-view";
import { toRecipePageModel } from "@/lib/mgr/recipe-view";

const text = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node)).replace(/<[^>]*>/g, " ");

describe("standing help removed where a field error already names the limit (#1518)", () => {
  it("New order and Edit draft no longer quote the quantity ceiling", () => {
    const newOrder = text(createElement(NewOrderView, { model: toNewOrderViewProps(newOrderDraft) }));
    expect(newOrder).not.toContain("9,999,999,999.99");
    expect(newOrder).toContain("Order number is assigned when you save the draft.");
    const draft = text(createElement(EditDraftOrderView, { model: editDraftOrder }));
    expect(draft).not.toContain("9,999,999,999.99");
    expect(draft).toContain("Saving keeps this order a draft and refreshes line prices.");
  });

  it("Edit price group keeps one short line per field and no stored ceiling", () => {
    const html = text(createElement(PriceGroupView, { model: toPriceGroupViewProps(pricingGrid), footer: null }));
    expect(html).not.toContain("21,474,836.47");
    expect(html).not.toContain("Position starts at 1");
    expect(html).not.toContain("Saving never moves a brand");
  });

  it("Brand ABV has no range note; its field error states 0 to 99.99", () => {
    const html = text(createElement(BrandView, { model: toBrandViewProps(brandHazy) }));
    expect(html).not.toContain("Optional percentage from 0 to 99.99");
  });
});

describe("one line where the help ran to a paragraph (#1518)", () => {
  it("each alias note is one line that still says who sees it", () => {
    const brand = text(createElement(BrandView, { model: toBrandViewProps(brandHazy) }));
    expect(brand).toContain("An informal name staff use, such as a series number. Search finds it; buyers never see it.");
    expect(CUSTOMER_ALIAS_HELP).toBe("Another name staff know this customer by. Search finds it; buyers never see it.");
    expect(text(createElement(CustomerView, { model: toCustomerViewProps(customerRidgeline) }))).toContain(CUSTOMER_ALIAS_HELP);
  });

  it("Taproom variance keeps only the dash legend; the staff guide carries the rest", () => {
    const html = text(createElement(TaproomVarianceView, { model: taproomVariance }));
    expect(html).toContain("A dash means a value is unavailable.");
    expect(html).not.toContain("Guest kegs are never matched");
  });
});

describe("a note said twice is said once (#1518)", () => {
  it("Accounting push defaults: the banner already says earlier invoices keep theirs", () => {
    const html = text(createElement(QboDefaultsView, { allowAch: true, allowCard: true }));
    expect(html).toContain("invoices pushed earlier keep theirs");
    expect(html).not.toContain("never retroactively");
  });

  it("Transfer states the source remainder once, in its own field", () => {
    const html = text(createElement(CellarTransferView, { model: cellarTransferPils }));
    expect(html).toContain("Blend preview: BT1 7 + 3 = 10 / 10 bbl");
    expect(html.match(/9\.8 bbl/g)).toHaveLength(1);
    expect(html).not.toContain("recorded as loss.");
  });

  it("a cut recipe with one mash step does not repeat it as a summary", () => {
    const step = { title: "Single infusion", detail: "152 °F · 60 min" };
    const model = { title: "Pale v3", ingredients: [], mash: { title: "Mash schedule · 1 step", detail: "Total 60 min · 152 °F saccharification rest", rows: [step] } };
    expect(text(createElement(RecipeView, { model, readOnly: true }))).not.toContain("Total 60 min");
    const two = { ...model, mash: { ...model.mash, rows: [step, { title: "Mash out", detail: "168 °F · 10 min" }], detail: "Total 70 min · 152 °F saccharification rest" } };
    expect(text(createElement(RecipeView, { model: two, readOnly: true }))).toContain("Total 70 min");
  });
});

describe("shown only where it applies (#1518)", () => {
  it("Sale channels: the tax-change rule moves from the list to the channel sheet", () => {
    const list = text(createElement(SaleChannelsView, { model: toSaleChannelsViewProps(saleChannelsList) }));
    expect(list).not.toContain("new sales only");
    const sheet = text(createElement(ChannelView, { model: toChannelViewProps(channelExport) }));
    expect(sheet).toContain("A change applies to new sales only; filed months stay as they were.");
    expect(readFileSync("app/(app)/settings/channels/page.tsx", "utf8")).not.toContain("TAX_INFO");
  });

  it("Edit SKU mentions the keg pool only for a keg SKU", () => {
    const form = readFileSync("app/(app)/catalog/sku-form.tsx", "utf8");
    expect(form).toMatch(/packageType === "keg" && " Changing the keg pool affects future orders only\."/);
  });

  it("Schedule packaging run has no standing footer note", () => {
    const html = text(createElement(SchedulePackagingRunView, { model: schedulePackagingRun }));
    expect(html).not.toContain("Nothing moves until the run closes");
  });
});

describe("raw values tidied (#1518)", () => {
  it("SKU detail rounds a movement's barrels to two places", () => {
    const model = { ...INVENTORY_DETAIL, movements: [{ ...INVENTORY_DETAIL.movements[0], bbl: 0.19354838 }] };
    const html = text(createElement(InventoryDetailView, { model }));
    expect(html).toContain("0.19 bbl");
    expect(html).not.toContain("0.19354838");
  });

  it("a recipe note drops the source system's raw import id", () => {
    const ctx = { materials: [], profiles: [], unit: "plato" as const, timeZone: "America/New_York" };
    const snapshot = { recipe: { id: "r", name: "Pale", brand_id: null, note: "Imported from Example Brewing recipe 0123456789abcdef01234567" }, versions: [], version: null, ingredients: [], waterAdditions: [], ogPlato: null, fgPlato: null, abv: null };
    expect(toRecipePageModel(snapshot, ctx).recipeNote).toBe("Imported from Example Brewing recipe");
    expect(toRecipePageModel({ ...snapshot, recipe: { ...snapshot.recipe, note: "House pale" } }, ctx).recipeNote).toBe("House pale");
  });
});
