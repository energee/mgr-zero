// Parse only: never compile, run, import app code, or enable file-inclusion plugins.
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { createProcessor } from "@mdx-js/mdx";
import type { Nodes } from "mdast";
import { describe, expect, it } from "vitest";

const processor = createProcessor();
// Explicit JSX only. Markdown headings, links, tables and fenced examples remain prose.
// Keep this deliberately narrower than Fumadocs' complete component registry.
const components: Record<string, true> = {
  Screen: true, Card: true, Cards: true, Callout: true, DocIcon: true, ScreenExplorer: true, ScreenIndex: true,
};
const markdown: Record<string, true> = {
  root: true, paragraph: true, text: true, heading: true, thematicBreak: true, blockquote: true,
  list: true, listItem: true, break: true, emphasis: true, strong: true, link: true, image: true,
  linkReference: true, imageReference: true, definition: true, inlineCode: true, code: true,
};

function assertSafeMdx(source: string) {
  function visit(node: Nodes) {
    if (node.type === "mdxFlowExpression" || node.type === "mdxTextExpression") {
      const program = node.data?.estree;
      // API generator markers are comments, not executable expressions. Inspect
      // the parsed program so a comment followed by code cannot masquerade as one.
      if (!program || program.body.length || !program.comments?.length ||
          program.comments.some(comment => comment.type !== "Block")) {
        throw new Error("MDX expressions must contain only block comments");
      }
    } else if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
      if (!node.name || !Object.hasOwn(components, node.name)) {
        throw new Error(`Unapproved MDX element: ${node.name ?? "fragment"}`);
      }
      for (const attribute of node.attributes) {
        if (attribute.type !== "mdxJsxAttribute") {
          throw new Error("MDX spread attributes are not allowed");
        }
        if (typeof attribute.value === "object" && attribute.value !== null) {
          // The chooser's existing icon prop is the sole expression exception.
          // Parse it as MDX too: exactly one empty DocIcon with one literal name.
          const icon = processor.parse(attribute.value.value).children;
          const element = icon[0];
          if (node.name !== "Card" || attribute.name !== "icon" || icon.length !== 1 ||
              element.type !== "mdxJsxFlowElement" || element.name !== "DocIcon" ||
              element.children.length !== 0 || element.attributes.length !== 1 ||
              element.attributes[0].type !== "mdxJsxAttribute" || element.attributes[0].name !== "name" ||
              typeof element.attributes[0].value !== "string") {
            throw new Error("MDX attributes must be literal, except Card icon={<DocIcon name=\"literal\" />}");
          }
        }
      }
    } else if (!Object.hasOwn(markdown, node.type)) {
      // ESM, HTML, directives and any newly introduced syntax fail closed.
      throw new Error(`Unapproved MDX node: ${node.type}`);
    }
    if ("children" in node) node.children.forEach(visit);
  }
  visit(processor.parse(source));
}

const root = resolve(__dirname, "..");
const docs = resolve(root, "content/docs");
function mdxFiles(directory: string): string[] {
  // Check the parent too: content/ itself must not redirect the docs root.
  for (const path of [resolve(directory, ".."), directory]) {
    if (!lstatSync(path).isDirectory()) {
      throw new Error(`Docs content must be a regular directory: ${path}`);
    }
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Docs symlinks are not allowed: ${path}`);
    if (entry.isDirectory()) return mdxFiles(path);
    if (!entry.name.endsWith(".mdx")) return [];
    if (!entry.isFile()) throw new Error(`Docs MDX must be a regular file: ${path}`);
    return [path];
  }).sort();
}

describe("non-evaluating MDX publication boundary", () => {
  it.each(mdxFiles(docs))("accepts current guide %s", path => {
    expect(() => assertSafeMdx(readFileSync(path, "utf8")), relative(root, path)).not.toThrow();
  });

  it.each([
    "{process.env.X}",
    "Text {process.env.X}",
    "{globalThis.__mdxSafetySentinel = true}",
    "{/* marker */ process.env.X}",
    "{/**/ + process.env.X}",
    "{}",
    "import value from './outside.js'",
    "export const value = 1",
    '<Card title={x} />',
    '<Card title={"literal"} />',
    '<Screen {...props} />',
    '<Card icon={<DocIcon name={process.env.X} />} />',
    '<Card icon={<DocIcon name="staff" {...props} />} />',
    '<Card icon={<DocIcon name="staff">{process.env.X}</DocIcon>} />',
    '<Card icon={<DocIcon name="staff" /> || process.env.X} />',
    '<Card icon={(() => <DocIcon name="staff" />)()} />',
    '<Card icon={<Other name="staff" />} />',
    '<Card title={<DocIcon name="staff" />} />',
    '<Screen icon={<DocIcon name="staff" />} />',
    '<include>../../.env</include>',
    '<include src="../../.env" />',
    '<script>alert(1)</script>',
    '<Unknown />',
    '<Card.Other />',
    '<>fragment</>',
    '<Cards><Card>Nested {process.env.X}</Card></Cards>',
  ])("rejects active or unapproved source: %s", source => {
    expect(() => assertSafeMdx(source)).toThrow();
  });

  it("does not evaluate a sentinel or read an include outside the content root", () => {
    const outside = mkdtempSync(join(tmpdir(), "mgr-mdx-safety-"));
    const path = join(outside, "outside.txt");
    const sentinel = "MGR_MDX_SYNTHETIC_OUTSIDE_CONTENT";
    writeFileSync(path, sentinel);
    try {
      expect(() => assertSafeMdx('{(() => { throw new Error("EXECUTED_SENTINEL") })()}'))
        .toThrow("MDX expressions must contain only block comments");
      expect(() => assertSafeMdx(`<include>${path}</include>`)).toThrow("Unapproved MDX element: include");
      expect(readFileSync(path, "utf8")).toBe(sentinel);
    } finally {
      rmSync(outside, { recursive: true });
    }
  });

  it.each(["file", "directory", "content root", "content parent"])("rejects an outside-content %s symlink before reading it", kind => {
    const outside = mkdtempSync(join(tmpdir(), "mgr-mdx-symlink-"));
    const content = join(outside, "docs");
    const sentinel = join(outside, "outside.mdx");
    mkdirSync(content);
    writeFileSync(sentinel, "MGR_MDX_SYNTHETIC_OUTSIDE_CONTENT");
    try {
      if (kind === "content root") {
        const link = join(outside, "linked-docs");
        symlinkSync(content, link, "dir");
        expect(() => mdxFiles(link)).toThrow("Docs content must be a regular directory");
      } else if (kind === "content parent") {
        const link = join(outside, "linked-parent");
        symlinkSync(outside, link, "dir");
        expect(() => mdxFiles(join(link, "docs"))).toThrow("Docs content must be a regular directory");
      } else {
        symlinkSync(kind === "file" ? sentinel : outside, join(content, kind === "file" ? "guide.mdx" : "nested"));
        expect(() => mdxFiles(content)).toThrow("Docs symlinks are not allowed");
      }
    } finally {
      rmSync(outside, { recursive: true });
    }
  });

  it("accepts approved literal components, icon props, comments and inert code examples", () => {
    expect(() => assertSafeMdx(`
<Cards>
  <Card title="Orders" href="/docs/staff-guide" external icon={<DocIcon name="staff" />}>
    <Callout type="info">Read the guide.</Callout>
  </Card>
</Cards>

<Screen name="Orders" />

<ScreenIndex kind="venues" />

<ScreenExplorer />

<DocIcon name="api" />

{/* ops:orders */}

Inline {/* inert marker */} text.

\`{process.env.X}\` is literal example text.

\`\`\`mdx
<include>../../.env</include>
{process.env.X}
\`\`\`
`)).not.toThrow();
  });
});
