import { expect, it } from "vitest";
import { labeledTaproomStock } from "@/lib/commands/landings";

it("labels taproom stock and refuses missing names", () => {
  const stock = [{ sku_id: "s1", location_id: "l1", qty: 7 }];
  expect(labeledTaproomStock(stock, new Map([["s1", "IPA"]]), new Map([["l1", "Bar"]])))
    .toEqual([{ skuId: "s1", locationId: "l1", sku: "IPA", location: "Bar", qty: 7 }]);
  expect(() => labeledTaproomStock(stock, new Map(), new Map([["l1", "Bar"]])))
    .toThrow(/Stock changed/);
});
