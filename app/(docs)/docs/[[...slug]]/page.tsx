// app/(docs)/docs/[[...slug]]/page.tsx — renders one guide from lib/source.ts
// with Fumadocs' page frame (title, description, table of contents). Static:
// every page in content/docs is enumerated at build time; anything else 404s.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { getMDXComponents } from "@/components/mdx";
import { SCREEN_TOC, VENUE_TOC } from "@/components/mgr/screen-index";
import { source } from "@/lib/source";

type Props = { params: Promise<{ slug?: string[] }> };

export default async function Page({ params }: Props) {
  const page = source.getPage((await params).slug);
  if (!page) notFound();
  const MDX = page.data.body;
  // Fumadocs builds a page's sub-index from its own MDX headings. These two
  // pages' headings come from <ScreenIndex /> instead, so their sections are
  // appended here — without this each has a table of contents with nothing in
  // it below the intro.
  const generated = { screens: SCREEN_TOC, integrations: VENUE_TOC }[page.slugs.join("/")];
  // The explorer has no headings but embeds desktop frames too, so it is full
  // width, and with nothing to list its table of contents is off: the empty
  // column would squeeze the frame to its rail on a laptop.
  const explorer = page.slugs.join("/") === "screens-explore";
  const wide = Boolean(generated) || explorer;
  const toc = generated ? [...page.data.toc, ...generated] : page.data.toc;
  // The generated pages embed frames at desktop width, so they take the full
  // column. `full` alone would also drop the table of contents (it only
  // defaults it off), so the TOC is re-enabled explicitly; the article's own
  // 1168px cap is lifted the same way, and the layout width in ../layout.tsx.
  return (
    <DocsPage
      toc={toc}
      full={wide || page.data.full}
      tableOfContent={{ enabled: !explorer }}
      className={wide ? "max-w-none" : undefined}
    >
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export const dynamicParams = false;

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = source.getPage((await params).slug);
  if (!page) notFound();
  return { title: `${page.data.title} · MGR`, description: page.data.description };
}
