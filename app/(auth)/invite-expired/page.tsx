import { E } from "@/components/mgr/e";
import { EntrySurface } from "@/components/mgr/entry-surface";
import { EntryView } from "@/components/mgr/views/entry";
import { expiredInviteModel } from "@/lib/mgr/entry-view";
import { MgrIcon } from "@/components/mgr-icon";

export default function InviteExpiredPage() {
  return <EntrySurface>
    {E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>)}
    <EntryView model={expiredInviteModel} primaryHref="/reset" secondaryHref="/login" />
  </EntrySurface>;
}
