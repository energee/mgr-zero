import { expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/brewery", () => ({ getActiveBrewery: async () => ({ id: "brewery", role: "admin" }) }));
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({}) }));
vi.mock("@/lib/mgr/page-query", () => ({ runPageQuery: query }));
vi.mock("@/lib/commands/all", () => ({}));
import SkuListPage from "@/app/(app)/catalog/brands/[id]/skus/page";

it("remounts a pour editor when refreshed name or serving size changes", async () => {
  async function editor(name: string, ounces: number) {
    query.mockImplementation(async (command: string) => command === "list_brands"
      ? [{ id: "brand", name: "Beer", skus: [], pours: [{ id: "pour", name, ounces }] }]
      : []);
    const page = await SkuListPage({ params: Promise.resolve({ id: "brand" }) });
    return page.props.rowAction(page.props.model.rows[0]);
  }
  const original = await editor("Pint", 16);
  const renamed = await editor("Glass", 16);
  const resized = await editor("Glass", 12);
  expect(original.key).not.toBeNull();
  expect(renamed.key).not.toBe(original.key);
  expect(resized.key).not.toBe(renamed.key);
  expect(resized.props.pour).toMatchObject({ name: "Glass", ounces: 12 });
});
