import { expect, it } from "vitest";
import config from "@/next.config";

it.each(["/catalog/skus", "/catalog/skus/new"])("redirects %s to the brand-first Catalog flow", async source => {
  expect(await config.redirects!()).toContainEqual({
    source, destination: "/catalog", permanent: false,
  });
});

it("redirects /guide to the chooser for staff and customer guides", async () => {
  expect(await config.redirects!()).toContainEqual({
    source: "/guide", destination: "/docs", permanent: false,
  });
});
