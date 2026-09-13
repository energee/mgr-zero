import { redirect } from "next/navigation";
import { E } from "@/components/mgr/e";
import { EntryView } from "@/components/mgr/views/entry";
import { EntrySurface } from "@/components/mgr/entry-surface";
import { MgrIcon } from "@/components/mgr-icon";
import { toAcceptInviteViewProps } from "@/lib/mgr/entry-view";
import { createRequestAuthContext } from "@/lib/auth/request-context";
import { inviteAudience, inviteLanding } from "@/lib/auth/invite";
import { createServerClient } from "@/lib/supabase/server";
import { acceptInvite } from "../actions";

export default async function AcceptPage({ searchParams }: { searchParams: Promise<{ audience?: string; error?: string; name?: string }> }) {
  const { audience: rawAudience, error, name } = await searchParams;
  const audience = inviteAudience(rawAudience);
  if (!audience) redirect("/invite-expired");
  const db = await createServerClient();
  const { data } = await db.auth.getUser();
  const landing = await inviteLanding(createRequestAuthContext(() => Promise.resolve(db)), audience);
  if (!landing || data.user?.user_metadata?.mgr_invite_kind !== audience || data.user.user_metadata.mgr_invite_accepted) redirect("/invite-expired");

  return <EntrySurface>
    {E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>)}
    <EntryView model={{ ...toAcceptInviteViewProps(landing.name, landing.role), note: error ? "Enter your name and a password of at least 8 characters." : undefined }}
      action={acceptInvite} defaults={{ name }} hidden={<input type="hidden" name="audience" value={audience} />} />
  </EntrySurface>;
}
