// app/(auth)/entry.tsx — the frame every entry screen shares (screen records
// Reset password, Set new password, No membership, …): the MGR mark, a title,
// then the one form or message, centered like the sign-in card.
import { MgrIcon } from "@/components/mgr-icon";
import { E } from "@/components/mgr/e";
import { EntrySurface } from "@/components/mgr/entry-surface";

export function Entry({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <EntrySurface>
      {E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>)}
      {E.sp()}
      {E.ttl(title)}
      {children}
      {E.sp()}
    </EntrySurface>
  );
}
