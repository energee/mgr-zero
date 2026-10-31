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

it("denies unused browser capabilities on every route", async () => {
  const rules = await config.headers?.();
  const policy = rules?.find((rule) => rule.source === "/:path*")?.headers
    .find((header) => header.key.toLowerCase() === "permissions-policy")?.value;
  const permissions = new Map(policy?.split(",").map((entry) => {
    const [capability, allowlist] = entry.trim().split("=");
    return [capability, allowlist] as const;
  }));
  for (const capability of ["accelerometer", "camera", "display-capture", "geolocation", "gyroscope", "magnetometer", "microphone", "payment", "usb"]) {
    expect(permissions.get(capability), capability).toBe("()");
  }
});
