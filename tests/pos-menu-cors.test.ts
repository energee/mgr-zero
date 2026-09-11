import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ getPublishedMenu: vi.fn() }));
vi.mock("@/lib/supabase/public-menu", () => boundary);

import { GET } from "@/app/api/public/menus/[publicId]/route";

const context = { params: Promise.resolve({ publicId: "00000000-0000-4000-8000-000000000001" }) };

describe("public menu error CORS", () => {
  beforeEach(() => boundary.getPublishedMenu.mockReset());

  it("keeps missing and unavailable responses readable cross-origin without caching them", async () => {
    boundary.getPublishedMenu.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("private database detail"));
    const missing = await GET(new Request("https://mgr.test/api/public/menus/missing"), context);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Cache-Control")).toBe("no-store");
    expect(missing.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const unavailable = await GET(new Request("https://mgr.test/api/public/menus/unavailable"), context);
    log.mockRestore();
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("Cache-Control")).toBe("no-store");
    expect(unavailable.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await unavailable.json()).toEqual({ error: "menu unavailable" });
  });
});
