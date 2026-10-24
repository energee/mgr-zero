import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ReplenishmentView, type ReplenishmentViewProps } from "@/components/mgr/views/replenishment";
import { replenishmentLines } from "@/lib/replenishment-form";

const props: ReplenishmentViewProps = {
  model: {
    locationId: "taproom",
    locationName: "Lantern taproom",
    locations: [{ value: "taproom", label: "Lantern taproom" }],
    warehouses: [{ id: "warehouse", name: "Lantern warehouse" }],
    suggestions: [{ skuId: "a", sku: "Lantern pale · keg", par: 8, onHand: 3, suggested: 5 }],
    allocations: [{ id: "standing", skuId: "a", sku: "Lantern pale · keg", qty: 2 }],
    shortfalls: [],
    canEdit: false,
  },
  fromLocationId: "warehouse",
  qtys: { a: "5" },
};

it("keeps source and transfer controls disabled and omits mutation actions for Warehouse", () => {
  const out = renderToStaticMarkup(createElement(ReplenishmentView, props));
  const source = [...out.matchAll(/<button\b[^>]*>/g)].map((match) => match[0]).find((tag) => tag.includes('aria-label="From warehouse"'));
  expect(source).toBeDefined();
  expect(source).toMatch(/\sdisabled(?:=|\s|>)/);
  const quantities = out.match(/<input\b[^>]*type="number"[^>]*>/g) ?? [];
  expect(quantities).toHaveLength(2);
  for (const input of quantities) {
    expect(input).toMatch(/\sdisabled(?:=|\s|>)/);
    expect(input).toContain('value="5"');
  }
  const steppers = [...out.matchAll(/<button\b[^>]*aria-label="(?:Decrease|Increase)"[^>]*>/g)].map((match) => match[0]);
  expect(steppers).toHaveLength(4);
  for (const button of steppers) expect(button).toMatch(/\sdisabled(?:=|\s|>)/);
  expect(out).not.toContain('type="submit"');
  expect(out).not.toContain("Create replenishment order");
  expect(out).not.toContain("Set taproom par");
  expect(out).not.toContain("Set standing allocation");
  expect(out).not.toMatch(/<button\b[^>]*>Release<\/button>/);
});

it("keeps both responsive editors enabled for editors without reusing their IDs", () => {
  const out = renderToStaticMarkup(createElement(ReplenishmentView, { ...props, model: { ...props.model, canEdit: true } }));
  const quantities = out.match(/<input\b[^>]*type="number"[^>]*>/g) ?? [];
  expect(quantities).toHaveLength(2);
  for (const input of quantities) expect(input).not.toMatch(/\sdisabled(?:=|\s|>)/);
  const ids = quantities.map((input) => input.match(/\bid="([^"]+)"/)?.[1]);
  expect(ids.every(Boolean)).toBe(true);
  expect(new Set(ids).size).toBe(2);
  expect(out).toContain('type="submit"');
});

it("builds only positive lines, so an all-zero order has none to submit (#447)", () => {
  const suggestions = [{ skuId: "a" }, { skuId: "b" }, { skuId: "c" }];
  expect(replenishmentLines(suggestions, { a: "0", b: "", c: "3" })).toEqual([{ skuId: "c", qty: 3 }]);
  expect(replenishmentLines(suggestions, { a: "0", b: "0", c: "0" })).toEqual([]);
});

