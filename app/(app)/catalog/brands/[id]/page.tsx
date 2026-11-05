// app/(app)/catalog/brands/[id]/page.tsx — Brand (screen record) as a page: one
// brand's sellable facts, or a blank one at /catalog/brands/new. The body is
// brand-detail.tsx, which the brand sheet over Catalog also mounts.
import { navTitle } from "@/lib/mgr/nav";
import { BrandDetail, getBrandPageData } from "./brand-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getBrandPageData(id);
  return { title: navTitle(id === "new" ? "/catalog/brands/new" : "/catalog/brands") };
}

export default async function BrandDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BrandDetail id={id} />;
}
