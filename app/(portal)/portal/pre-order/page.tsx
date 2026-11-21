// app/(portal)/portal/pre-order/page.tsx — the portal's Pre-order page: beer the
// brewery has planned and released ahead of packaging. It is the Shop page
// (../page.tsx) drawing its Pre-order list; the cart is the same one Order fills.
import ShopPage from "../page";

export const metadata = { title: "Pre-order" };

/** `?suggested=1` (the digest's "Review and submit" link) opens it with the buyer's usual quantities filled in. */
export default function PreOrderPage({ searchParams }: { searchParams: Promise<{ draft?: string; reorder?: string; suggested?: string }> }) {
  return <ShopPage searchParams={searchParams} section="pre-order" />;
}
