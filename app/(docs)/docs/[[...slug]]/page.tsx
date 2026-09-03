// app/(docs)/docs/[[...slug]]/page.tsx — renders one guide from lib/source.ts
// with Fumadocs' page frame (title, description, table of contents). Static:
// every page in content/docs is enumerated at build time; anything else 404s.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { getMDXComponents } from "@/components/mdx";
import { SCREEN_TOC } from "@/components/mgr/screen-index";
import { source } from "@/lib/source";

type Props = { params: Promise<{ slug?: string[] }> };

export default async function Page({ params }: Props) {
  const page = source.getPage((await params).slug);
  if (!page) notFound();
  const MDX = page.data.body;
  // Fumadocs builds a page's sub-index from its own MDX headings. The screen
  // inventory's headings come from <ScreenIndex /> instead, so its areas are
  // appended here — without this the page has a table of contents with nothing
  // in it below the intro.
  const toc = page.slugs.join("/") === "screens" ? [...page.data.toc, ...SCREEN_TOC] : page.data.toc;
  return (
    <DocsPage toc={toc} full={page.data.full}>
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
