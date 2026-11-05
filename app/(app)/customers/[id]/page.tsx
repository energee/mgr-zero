// app/(app)/customers/[id]/page.tsx — Customer detail (screen record) as a page:
// the shared live body (customer-detail.tsx), which the customer sheet
// (../customer-sheet.tsx) also mounts. An unknown or malformed id renders not-found.tsx.
import { navTitle } from "@/lib/mgr/nav";
import { getCustomerPageData } from "../customer-data";
import { CustomerDetail } from "./customer-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getCustomerPageData(id);
  return { title: navTitle("/customers") };
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerDetail id={id} />;
}
