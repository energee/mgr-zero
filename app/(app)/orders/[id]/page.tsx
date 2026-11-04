// app/(app)/orders/[id]/page.tsx — Order (screen record) as a page: the shared
// live body (order-detail.tsx), which the order sheet (../order-sheet.tsx) also mounts.
// An unknown or malformed id renders not-found.tsx.
import { navTitle } from "@/lib/mgr/nav";
import { getOrderPageData } from "../order-data";
import { OrderDetail } from "./order-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getOrderPageData(id);
  return { title: navTitle("/orders") };
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The page reads first (cached, so OrderDetail reuses it): a missing order is not-found before anything renders.
  await getOrderPageData(id);
  return <OrderDetail id={id} />;
}
