import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ReplenishmentView, type ReplenishmentViewProps } from "@/components/mgr/views/replenishment";

function view() {
  const props: ReplenishmentViewProps = {
    model: {
      locationId: "taproom",
      locationName: "Lantern taproom",
      locations: [{ value: "taproom", label: "Lantern taproom" }],
      warehouses: [{ id: "warehouse", name: "Lantern warehouse" }],
      suggestions: [
        { skuId: "ten", sku: "Beer 10 · keg", par: 12, onHand: 2, suggested: 10 },
        { skuId: "two", sku: "Beer 2 · keg", par: 8, onHand: 6, suggested: 2 },
      ],
      allocations: [{ id: "standing", skuId: "two", sku: "Beer 2 · keg", qty: 3 }],
      shortfalls: [{
        skuId: "ten", onHand: 2, allocated: 5, atp: -3,
        detail: {
          title: "Beer 10 · keg", atp: "−3 kegs · −1.5 bbl", atpDetail: "ATP · 2 kegs on hand · 5 allocated",
          rows: [
            { key: "order", title: "Order 231 · Orchard Lantern", detail: "2 kegs · 1 bbl", verb: "Review", tone: "primary", href: "/orders/order-id" },
            { key: "standing", title: "Lantern taproom standing", detail: "3 kegs · 1.5 bbl", verb: "Review", tone: "primary", href: "/replenishment?location=taproom#standing-allocations" },
          ],
        },
      }],
      canEdit: true,
    },
    fromLocationId: "warehouse",
    qtys: { ten: "2.5", two: "10" },
  };
  return { props, render: (next: Partial<ReplenishmentViewProps> = {}) => renderToStaticMarkup(createElement(ReplenishmentView, { ...props, ...next })) };
}

it("draws one page heading and separates taproom records, standing allocations, and global shortfalls", () => {
  const out = view().render();
  expect(out.match(/<h1\b/g)).toHaveLength(1);
  expect(out).toMatch(/<h1\b[^>]*>Replenishment<\/h1>/);
  expect(out.match(/>Finished goods<\/a>/g)).toHaveLength(1);
  expect(out.indexOf('aria-label="Location"')).toBeLessThan(out.indexOf("Taproom replenishment"));
  expect(out.indexOf("Taproom replenishment")).toBeLessThan(out.indexOf('id="standing-allocations"'));
  expect(out.indexOf('id="standing-allocations"')).toBeLessThan(out.indexOf("Shortfalls across all locations"));
  expect(out).toContain('id="shortfalls"');
  expect(out.match(/<table\b/g)).toHaveLength(3);
  expect(out.match(/<details\b/g)).toHaveLength(2);
  expect(out).not.toMatch(/<details\b[^>]*\bopen/);
  expect(out).toContain("−3 kegs · −1.5 bbl");
  expect(out).toContain("ATP · 2 kegs on hand · 5 allocated");
  for (const href of ["/orders/order-id", "/replenishment?location=taproom#standing-allocations"]) {
    expect(out.split(`href="${href}"`)).toHaveLength(3);
  }
});

it("starts in natural SKU order while keeping each controlled quantity with its SKU", () => {
  const { props, render } = view();
  const out = render();
  const table = out.slice(out.indexOf("<table"), out.indexOf("</table>"));
  expect(table.indexOf("Beer 2 · keg")).toBeLessThan(table.indexOf("Beer 10 · keg"));
  const inputs = out.match(/<input\b[^>]*type="number"[^>]*>/g) ?? [];
  expect(inputs).toHaveLength(4);
  for (const input of inputs) {
    expect(input).toContain(input.includes('aria-label="Beer 2') ? 'value="10"' : 'value="2.5"');
  }
  expect(table).not.toContain('href="#"');
  const transferHead = table.match(/<th\b[^>]*>[\s\S]*?<\/th>/g)?.find((head) => head.includes("Transfer qty"));
  expect(transferHead).toContain('aria-sort="none"');

  const changed = render({ model: { ...props.model, suggestions: [...props.model.suggestions].reverse() }, qtys: { ten: "", two: "0" } });
  const changedInputs = changed.match(/<input\b[^>]*type="number"[^>]*>/g) ?? [];
  for (const input of changedInputs) {
    expect(input).toContain(input.includes('aria-label="Beer 2') ? 'value="0"' : 'value=""');
  }
});

it("opens filtered reservation details and uses only the supplied All shortfalls destination", () => {
  const { props, render } = view();
  const out = render({ model: { ...props.model, skuFilter: "ten", allShortfallsHref: "/replenishment?location=taproom#shortfalls" } });
  expect(out.match(/<details\b[^>]*\bopen=""/g)).toHaveLength(2);
  expect(out).toContain('href="/replenishment?location=taproom#shortfalls"');
  expect(out).toContain("All shortfalls");
  const empty = render({ model: { ...props.model, skuFilter: "ten", shortfalls: [] } });
  expect(empty).toContain("This SKU has no current shortfall.");
  expect(empty).not.toContain("All shortfalls");
});

it("keeps global shortfalls visible with no taproom and does not create a transfer form", () => {
  const { props, render } = view();
  const out = render({ model: { ...props.model, locationId: null, locationName: null, locations: [], suggestions: [], allocations: [] } });
  expect(out).toContain("No taprooms yet: add one under Locations");
  expect(out).not.toContain("<form");
  expect(out).not.toContain("From warehouse");
  expect(out).toContain("Shortfalls across all locations");
  expect(out).toContain("Orchard Lantern");
});

it("shows missing-source guidance without inventing a Locations destination", () => {
  const { props, render } = view();
  const model = { ...props.model, warehouses: [] };
  const out = render({ model, fromLocationId: "" });
  expect(out).toContain("No other location has the Warehouse use.");
  expect(out).not.toContain("Open Locations");
  const linked = render({ model: { ...model, locationsHref: "/locations" }, fromLocationId: "" });
  expect(linked).toContain('href="/locations"');
  expect(linked).toContain("Open Locations");
});

it("keeps command action forms outside the transfer form and honors null action suppression", () => {
  const { render } = view();
  const out = render({
    quantityActions: createElement("form", { "aria-label": "Set par" }),
    releaseAction: () => createElement("form", { "aria-label": "Release allocation" }),
    submitAction: createElement("button", { type: "submit" }, "Create transfer"),
  });
  expect(out).toContain('aria-label="Set par"');
  expect(out).toContain('aria-label="Release allocation"');
  let depth = 0;
  for (const tag of out.match(/<form\b[^>]*>|<\/form>/g) ?? []) {
    depth += tag.startsWith("</") ? -1 : 1;
    expect(depth).toBeLessThanOrEqual(1);
  }
  expect(depth).toBe(0);
  const suppressed = render({ quantityActions: null, submitAction: null, releaseAction: () => null });
  expect(suppressed).not.toContain("Set taproom par");
  expect(suppressed).not.toContain("Create replenishment order");
  expect(suppressed).not.toMatch(/<button\b[^>]*>Release<\/button>/);
});
