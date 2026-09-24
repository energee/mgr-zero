// tests/local-module.ts — resolve an `@/` or relative import specifier to the
// file on disk, for the structural tests that walk the import graph as source
// text (screen-view-composition, boundary). Paths are relative to the repo root.
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function localModule(from: string, specifier: string): string | undefined {
  const base = specifier.startsWith("@/")
    ? resolve(specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(from), specifier)
      : undefined;
  if (!base) return undefined;
  return [base, `${base}.tsx`, `${base}.ts`, resolve(base, "index.tsx"), resolve(base, "index.ts")]
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}
