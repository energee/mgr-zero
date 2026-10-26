// #1299: the error card shows Next's digest so a report can be matched to the
// server log line instrumentation.ts writes, and never shows the error text.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RouteError } from "@/components/mgr/route-error";
import { onRequestError } from "@/instrumentation";

const render = (error: unknown) => renderToStaticMarkup(createElement(RouteError, { error, retry: () => {} }));

describe("route error reference (#1299)", () => {
  it("shows the digest as a reference, never the error message", () => {
    const html = render(Object.assign(new Error("brewery_users read failed: secret"), { digest: "4012345678" }));
    expect(html).toContain("Reference: 4012345678");
    expect(html).not.toContain("secret");
  });

  it("shows no reference line when there is no digest", () => {
    expect(render(new Error("client render failed"))).not.toContain("Reference");
    expect(render("thrown string")).not.toContain("Reference");
  });

  it("logs one structured line with the digest and route, not the message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await onRequestError(
      Object.assign(new Error("secret"), { digest: "4012345678" }),
      { path: "/", method: "GET", headers: {} },
      { routerKind: "App Router", routePath: "/(app)/page", routeType: "render", renderSource: "server-rendering", revalidateReason: undefined },
    );
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0].join(" "));
    expect(line).toContain('"digest":"4012345678"');
    expect(line).toContain('"routePath":"/(app)/page"');
    expect(line).not.toContain("secret");
    log.mockRestore();
  });
});
