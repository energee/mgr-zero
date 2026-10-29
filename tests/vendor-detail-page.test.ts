// tests/vendor-detail-page.test.ts — the live vendor page (#1586) asks each
// registered list for one vendor's rows (the filter is a query input, never a
// page filter), reads purchase orders only for a role that may, and mounts the
// shared VendorDetailView with VendorForm as its Edit.
import { beforeEach, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";

const state = vi.hoisted(() => ({ roles: ["admin"], inputs: {} as Record<string, unknown> }));
vi.mock("@/lib/brewery", () => ({ getActiveBrewery: async () => ({ id: "brewery", roles: state.roles }) }));
// The real registry loads, so canRun answers each role the way it does live.
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({ breweryId: "brewery", roles: state.roles }), isUuid: () => true }));
vi.mock("next/navigation", () => ({ notFound() { throw new Error("not found"); } }));
vi.mock("@/lib/mgr/page-query", () => ({ runPageQuery: query }));

const VENDOR = "a0000000-0000-4000-8000-000000000001";
const vendor = { id: VENDOR, name: "Hop Co", email: null, phone: null, payment_terms: "net30", lead_time_days: 7, active: true, observed: [], contracts: [] };
async function query(name: string, input: unknown) {
  state.inputs[name] = input;
  switch (name) {
    case "list_vendors_and_contracts": return [vendor];
    case "list_purchase_orders": return [{ id: "po", po_no: 7, status: "draft", closed_at: null, ordered_on: null, expected_on: null, lines_open: 1 }];
    case "list_materials": return [{ id: "m", name: "Citra", category: "hop", purchase_uom: "lb", active: false }];
    default: throw new Error(name);
  }
}

import VendorPage from "@/app/(app)/vendors/[id]/page";
import { VendorForm } from "@/app/(app)/vendors/vendor-form";
import { VendorDetailView } from "@/components/mgr/views/vendor-detail";

beforeEach(() => { state.roles = ["admin"]; state.inputs = {}; });
const render = async () => (await VendorPage({ params: Promise.resolve({ id: VENDOR }) })) as ReactElement<{ model: { purchaseOrders: unknown }; editAction: ReactElement<{ vendor: unknown }>; linkRows: boolean }>;

it("reads one vendor, its open orders and every default material, then mounts the shared view", async () => {
  const page = await render();
  expect(state.inputs).toEqual({
    list_vendors_and_contracts: { vendorId: VENDOR },
    list_purchase_orders: { vendorId: VENDOR },
    list_materials: { defaultVendorId: VENDOR, includeInactive: true },
  });
  expect(page.type).toBe(VendorDetailView);
  expect(page.props.linkRows).toBe(true);
  expect(isValidElement(page.props.editAction) && page.props.editAction.type).toBe(VendorForm);
  expect(page.props.editAction.props.vendor).toMatchObject({ id: VENDOR, name: "Hop Co" });
});

it("asks no purchase orders for Brewer, and leaves the section out", async () => {
  state.roles = ["brewer"];
  const page = await render();
  expect(state.inputs).not.toHaveProperty("list_purchase_orders");
  expect(page.props.model.purchaseOrders).toBeNull();
});
