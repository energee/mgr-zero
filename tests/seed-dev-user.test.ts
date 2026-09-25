// The dev seed finds its user past GoTrue's first page of listUsers (#479).
import { expect, it, vi } from "vitest";
import { findUserByEmail } from "@/scripts/seed-dev-user";

const user = (n: number) => ({ id: `id-${n}`, email: `user${n}@test.local` });

function pagedAdmin(total: number, perPageCap = 50) {
  const all = Array.from({ length: total }, (_, n) => user(n));
  return {
    listUsers: vi.fn(async ({ page = 1, perPage = 50 }: { page?: number; perPage?: number } = {}) => {
      const size = Math.min(perPage, perPageCap), users = all.slice((page - 1) * size, page * size);
      return { data: { users, nextPage: page * size < total ? page + 1 : null }, error: null };
    }),
  };
}

it("finds a user beyond the first page", async () => {
  const admin = pagedAdmin(120);
  expect(await findUserByEmail(admin, "user117@test.local")).toEqual(user(117));
  expect(admin.listUsers.mock.calls.length).toBeGreaterThan(1);
});

it("returns undefined after the last page when no user matches", async () => {
  expect(await findUserByEmail(pagedAdmin(120), "dev@mgr.local")).toBeUndefined();
});

it("throws a listUsers error", async () => {
  const admin = { listUsers: vi.fn(async () => ({ data: { users: [], nextPage: null }, error: new Error("boom") })) };
  await expect(findUserByEmail(admin, "dev@mgr.local")).rejects.toThrow("boom");
});
