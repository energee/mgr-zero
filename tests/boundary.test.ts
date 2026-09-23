// tests/boundary.test.ts — structural rules the type checker cannot state:
// which module owns a formatter, and which modules a client or shared-view
// file may import. Source text is the subject, because the rule is about the
// import graph rather than a value any function returns.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localModule } from "./local-module";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("money formatting has one owner", () => {
  // lib/qbo.ts sends a decimal string to QuickBooks rather than drawing one
  // for an operator, so it is not a display site and stays as it is.
  const SITES = [
    "lib/mgr/keg-labels.ts",
    "lib/mgr/pos-view.ts",
    "app/(app)/kegs/pool-form.tsx",
    "app/(app)/vendors/contract-form.tsx",
    "app/(app)/menu/item/[formatId]/page.tsx",
    "app/(portal)/portal/cart.tsx",
  ];

  it.each(SITES)("%s formats cents through lib/mgr/money.ts", (path) => {
    expect(read(path)).not.toMatch(/100\)\.toFixed\(2\)/);
  });

  it("keeps the two shapes distinct in the owner", () => {
    const money = read("lib/mgr/money.ts");
    expect(money).toMatch(/export const money/);
    expect(money).toMatch(/export const dollarsInput/);
  });
});

describe("sale-removal volume has one owner", () => {
  it("is defined in lib/volume.ts and imported by both shipment adapters", () => {
    expect(read("lib/volume.ts")).toMatch(/export function saleVolume/);
    for (const path of ["lib/mgr/ship-view.ts", "lib/mgr/shipment-done-view.ts"]) {
      expect(read(path), path).not.toMatch(/function saleVolume/);
      expect(read(path), path).toMatch(/saleVolume.*from "@\/lib\/volume"|from "@\/lib\/volume"/);
    }
  });
});

describe("tax treatments live in lib, not under app/", () => {
  it("is owned by lib/mgr/tax-treatments.ts", () => {
    expect(read("lib/mgr/tax-treatments.ts")).toMatch(/export const TAX_TREATMENTS/);
  });

  it("has no importer reaching into the settings route", () => {
    for (const path of ["lib/mgr/channel-view.ts", "lib/mgr/customer-view.ts"]) {
      expect(read(path), path).not.toMatch(/settings\/channels\/tax-treatments/);
    }
  });

  it("drops the sentenceCase aliases", () => {
    expect(read("lib/mgr/sale-channels-view.ts")).not.toMatch(/channelTreatmentLabel/);
    expect(read("lib/mgr/tax-treatments.ts")).not.toMatch(/export const treatmentLabel/);
  });
});

describe("client and shared-view files never import the command registry", () => {
  // lib/commands/*.ts call defineCommand at module scope, so importing one
  // pulls the whole registry (and its server-only dependencies) into a
  // "use client" bundle. Plain option arrays belong in lib/mgr/enums.ts.
  it("lib/mgr/enums.ts imports nothing from lib/commands", () => {
    expect(read("lib/mgr/enums.ts")).not.toMatch(/@\/lib\/commands/);
  });

  // The modules that actually register commands at import time. A `import type`
  // from one is erased before the bundler sees it, and lib/commands/client.ts
  // and use-command-form.ts are the browser's own callers, so neither is the
  // import this rule is about.
  const registryModules = readdirSync(new URL("../lib/commands", import.meta.url))
    .filter((name) => name.endsWith(".ts"))
    .filter((name) => /\bdefine(Command|Query)\(/.test(read(`lib/commands/${name}`)))
    .map((name) => name.replace(/\.ts$/, ""));

  const views = readdirSync(new URL("../components/mgr/views", import.meta.url))
    .filter((name) => name.endsWith(".tsx"));

  it("finds the registry modules and the shared views", () => {
    expect(registryModules).toContain("taproom");
    expect(registryModules).toContain("production");
    expect(views.length).toBeGreaterThan(0);
  });

  it.each(views)("components/mgr/views/%s imports no registry module for its values", (name) => {
    const source = read(`components/mgr/views/${name}`);
    for (const area of registryModules) {
      const valueImport = new RegExp(`import\\s+(?!type\\b)[^;]*from "@/lib/commands/${area}"`);
      expect(source, `${name} imports @/lib/commands/${area}`).not.toMatch(valueImport);
    }
  });

  it.each(["app/(app)/kegs/event-form.tsx", "app/(app)/kegs/pool-form.tsx"])(
    "%s takes its option arrays from lib/mgr/enums.ts",
    (path) => {
      const source = read(path);
      expect(source).toMatch(/"use client"/);
      expect(source).not.toMatch(/from "@\/lib\/commands\/taproom"/);
      expect(source).toMatch(/from "@\/lib\/mgr\/enums"/);
    },
  );
});

describe("server pages never call a function from a \"use client\" module", () => {
  // A server component can render a client component, but calling a plain
  // function exported next to one throws at request time ("Attempted to call
  // … from the server"), and only once the call actually runs — /recipes/new
  // rendered with no materials and 500'd with one (#440). One hop, named
  // imports only: a value re-exported through a barrel is not followed.
  const isClient = (src: string) => /^(\s*\/\/.*\n)*\s*["']use client["']/.test(src);
  const pages = (readdirSync(new URL("../app", import.meta.url), { recursive: true }) as string[])
    .filter((p) => /(^|\/)(page|layout)\.tsx$/.test(p)).map((p) => `app/${p}`);

  it.each(pages)("%s imports only components from client modules", (page) => {
    const src = read(page);
    if (isClient(src)) return;
    for (const [, names, spec] of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
      const file = localModule(page, spec);
      if (!file || !isClient(readFileSync(file, "utf8"))) continue;
      const values = names.split(",").map((s) => s.trim()).filter((s) => s && !s.startsWith("type ")).map((s) => s.split(/\s+as\s+/).pop()!);
      expect(values.filter((n) => /^[a-z]/.test(n)), `${page} → ${spec}`).toEqual([]);
    }
  });
});
