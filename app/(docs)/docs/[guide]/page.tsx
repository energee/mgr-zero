// app/(docs)/docs/[guide]/page.tsx — renders one customer guide from
// public/docs inside the app's root layout, so the guides share the app's
// design language by inheritance rather than by copying it. The `.guide`
// rules in app/globals.css style the fragment's semantic markup. Static:
// the three guides are enumerated at build time and anything else 404s.
import type { Metadata } from "next";
import { GUIDES, readGuide } from "@/lib/docs";

export const dynamicParams = false;
export function generateStaticParams() {
  return GUIDES.map((guide) => ({ guide }));
}

type Props = { params: Promise<{ guide: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `${readGuide((await params).guide).title} · MGR` };
}

export default async function GuidePage({ params }: Props) {
  const { html } = readGuide((await params).guide);
  // Trusted repo content: the maintainer workflow rejects scripts, links and handlers.
  return <div className="guide" dangerouslySetInnerHTML={{ __html: html }} />;
}
