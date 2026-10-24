import { MgrIcon } from "@/components/mgr-icon";
import { E } from "@/components/mgr/e";
import { EntrySurface } from "@/components/mgr/entry-surface";
import { EntryView } from "@/components/mgr/views/entry";
import { pageNotFoundModel } from "@/lib/mgr/entry-view";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return <EntrySurface>
    {E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>)}
    <EntryView model={pageNotFoundModel} primaryHref="/" />
  </EntrySurface>;
}
