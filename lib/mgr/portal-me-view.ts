// lib/mgr/portal-me-view.ts — shared Portal Me view-model.

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
