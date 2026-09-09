import { expect, it } from "vitest";
import config from "@/next.config";

it("sets global same-origin-compatible security headers", async () => {
  const headers = await config.headers?.();
  expect(headers).toEqual(expect.arrayContaining([expect.objectContaining({
    source: "/:path*",
    headers: expect.arrayContaining([
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ]),
  })]));
});
