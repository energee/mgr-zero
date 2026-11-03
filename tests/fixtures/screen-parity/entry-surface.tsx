import { EntrySurface } from "@/components/mgr/entry-surface";
import { EntryView } from "@/components/mgr/views/entry";
import { signIn } from "@/lib/mgr/fixtures/entry";

export default function EntrySurfaceOwner() {
  return <EntrySurface><EntryView model={signIn} /></EntrySurface>;
}
