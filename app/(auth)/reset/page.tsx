// app/(auth)/reset/page.tsx — Reset password (staff) and Portal forgot
// password (?portal=1) share a form whose confirmation comes from Auth's submit
// outcome. ?expired is the Expired reset landing from auth/confirm.
import { E } from "@/components/mgr/e";
import { EntrySurface } from "@/components/mgr/entry-surface";
import { EntryView } from "@/components/mgr/views/entry";
import { expiredResetModel } from "@/lib/mgr/entry-view";
import { MgrIcon } from "@/components/mgr-icon";
import { ResetForm } from "@/components/reset-form";

export const metadata = { title: "Reset password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ sent?: string; expired?: string; portal?: string }> }) {
  const { expired, portal } = await searchParams;
  return (
    <EntrySurface>
      {E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>)}
      {expired
        ? <EntryView model={expiredResetModel} primaryHref={`/reset${portal === "1" ? "?portal=1" : ""}`} />
        : <ResetForm portal={portal === "1"} />}
    </EntrySurface>
  );
}
