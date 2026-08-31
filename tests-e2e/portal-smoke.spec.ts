// tests-e2e/portal-smoke.spec.ts — local-only Playwright smoke: a customer
// portal user logs in, adds a sku to the cart, submits an order, and sees it
// on the orders list. Seeds its own brewery/customer via the admin client
// (same pattern as tests/commands-portal.test.ts); not part of the vitest
// suite or CI — run with `npm run test:e2e` against a running
// `npx supabase start` + `.env.local`.
import { test, expect } from "@playwright/test";
import { admin, makeBrewery, makeStaffCtx, makeCustomerUser } from "../tests/helpers";

let customerEmail: string;
let skuName: string;

test.beforeAll(async () => {
  const b = await makeBrewery();
  const staff = await makeStaffCtx(b.id, "admin");
  await admin.from("locations").insert({ brewery_id: b.id, name: "WH", kind: "warehouse" });
  const { data: p } = await admin.from("products").insert({ brewery_id: b.id, name: "IPA" }).select().single();
  const { data: s } = await admin
    .from("skus")
    .insert({ brewery_id: b.id, product_id: p!.id, name: "IPA case", package_type: "can", bbl_per_unit: 0.0645 })
    .select()
    .single();
  skuName = s!.name;
  const { data: pl } = await admin.from("price_lists").insert({ brewery_id: b.id, name: "std" }).select().single();
  await admin.from("price_list_items").insert({ brewery_id: b.id, price_list_id: pl!.id, sku_id: s!.id, unit_price_cents: 3600 });
  const { data: c } = await admin
    .from("customers")
    .insert({ brewery_id: b.id, name: "Bar", type: "retailer", state: "PA", price_list_id: pl!.id })
    .select()
    .single();
  await admin
    .from("ship_tos")
    .insert({ brewery_id: b.id, customer_id: c!.id, label: "Main", address1: "1 Main St", city: "Philadelphia", state: "PA", zip: "19100" });
  const { data: loc } = await admin.from("locations").select("id").eq("brewery_id", b.id).eq("kind", "warehouse").single();
  await admin.from("inventory_movements").insert({
    brewery_id: b.id, sku_id: s!.id, location_id: loc!.id, qty: 100, bbl: 100 * 0.0645,
    type: "production_in", created_by: staff.userId,
  });
  const custUser = await makeCustomerUser(c!.id);
  customerEmail = custUser.email;
});

test("customer logs in, orders from the catalog, and sees it submitted", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(customerEmail);
  await page.getByLabel("Password").fill("test-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByRole("heading", { name: "Shop" })).toBeVisible();

  const row = page.getByRole("row", { name: new RegExp(skuName) });
  await row.getByRole("spinbutton").fill("2");

  await page.getByLabel("Ship to").click();
  await page.getByRole("option", { name: /Main/ }).click();

  await page.getByRole("button", { name: "Submit order" }).click();

  await expect(page).toHaveURL(/\/portal\/orders\/[^/]+$/);
  await page.getByRole("link", { name: "Orders" }).click();

  await expect(page).toHaveURL(/\/portal\/orders$/);
  const orderRow = page.locator("tbody tr").first();
  await expect(orderRow).toContainText("submitted");
});
