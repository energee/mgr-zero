// Keeps heavy client packages out of every page's first load. A static import
// pulls a package into the initial JS of every route that reaches it; the Ask
// MGR conversation loads Streamdown on demand (React.lazy in composer.tsx), so
// the E vocabulary (components/mgr/e.tsx) and the shell's composer
// (components/mgr/composer.tsx, not views/composer.tsx) must not reach it statically.
// Walks source text: type-only imports and dynamic import() are not edges.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { localModule } from "./local-module";

/** Every package the file reaches through static value imports and re-exports. */
function staticPackages(entry: string): Set<string> {
  const packages = new Set<string>();
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest);
    for (const statement of source.statements) {
      const edge = ts.isImportDeclaration(statement) ? !statement.importClause?.isTypeOnly
        : ts.isExportDeclaration(statement) ? !statement.isTypeOnly && !!statement.moduleSpecifier
        : false;
      if (!edge) continue;
      const specifier = ((statement as ts.ImportDeclaration | ts.ExportDeclaration).moduleSpecifier as ts.StringLiteral).text;
      const local = localModule(file, specifier);
      if (local) visit(local);
      else if (!specifier.startsWith("@/") && !specifier.startsWith(".")) packages.add(specifier);
    }
  };
  visit(resolve(entry));
  return packages;
}

describe("first-load client imports", () => {
  it("loads Streamdown only with the Ask MGR conversation", () => {
    expect(staticPackages("components/mgr/composer-conversation.tsx")).toContain("streamdown");
    expect(staticPackages("components/mgr/e.tsx")).not.toContain("streamdown");
    expect(staticPackages("components/mgr/composer.tsx")).not.toContain("streamdown");
  });
});
