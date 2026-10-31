// Parse staged source as data; never import the screen module being validated.
import { execFileSync } from "node:child_process";
import ts from "typescript";

const path = "components/mgr/screens.tsx";

function annotationSkeleton(source: string) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const options: ts.CompilerOptions = { noLib: true, noResolve: true };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name) => name === path ? file : undefined;
  const program = ts.createProgram([path], options, host);
  if (program.getSyntacticDiagnostics(file).length) {
    throw new Error("HTTP API agent produced invalid screen TypeScript");
  }

  const declarations = file.statements.flatMap((statement) =>
    ts.isVariableStatement(statement) && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      ? statement.declarationList.declarations.filter((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "SCREENS")
      : []);
  const array = declarations.length === 1 ? declarations[0].initializer : undefined;
  if (!array || !ts.isArrayLiteralExpression(array)) {
    throw new Error("Expected one exported SCREENS array literal");
  }

  const parts: string[] = [];
  let cursor = 0;
  for (const [index, element] of array.elements.entries()) {
    // Keep generated spreads immutable in the unmasked source slices.
    if (ts.isSpreadElement(element)) continue;
    if (!ts.isObjectLiteralExpression(element)) throw new Error("Expected literal SCREENS records");
    const seen = new Set<string>();
    for (const property of element.properties) {
      if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name) ||
          (property.name.text !== "reads" && property.name.text !== "writes")) continue;
      const name = property.name.text;
      if (seen.has(name) || !ts.isStringLiteral(property.initializer)) {
        throw new Error("Screen reads/writes must be unique string literal properties");
      }
      seen.add(name);
      // Mask only the parsed literal token, not its leading comments, property,
      // delimiters or surrounding context. Everything else must remain exact.
      parts.push(source.slice(cursor, property.initializer.getStart(file)), `/* annotation ${index}:${name} */`);
      cursor = property.initializer.end;
    }
  }
  parts.push(source.slice(cursor));
  return parts.join("");
}

const original = execFileSync("git", ["show", `HEAD:${path}`], { encoding: "utf8" });
const staged = execFileSync("git", ["show", `:${path}`], { encoding: "utf8" });
if (annotationSkeleton(original) !== annotationSkeleton(staged)) {
  throw new Error("HTTP API agent changed screen source outside existing SCREENS reads/writes string literals");
}
