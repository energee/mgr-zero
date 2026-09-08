// lib/mgr/portal-me-view.ts — view-model for inventory Portal Me.
// Email and account come from the snapshot; live MeSheet stays its own sheet.

export type PortalMeViewModel = {
  email: string;
  account: string;
};

export type PortalMeSnapshot = {
  email: string;
  account: string;
};

/** Map a signed-in portal session onto PortalMeView. */
export function toPortalMeViewProps({ email, account }: PortalMeSnapshot): PortalMeViewModel {
  return { email, account };
}
