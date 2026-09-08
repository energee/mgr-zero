// lib/mgr/fixtures/portal-account.ts — get_portal_account snapshot for the
// Account inventory frame, plus the Portal Me signed-in pair. Views own no
// sample data.
import { RIDGELINE } from "./demo";
import type { PortalAccountSnapshot } from "@/lib/mgr/portal-account-view";
import type { PortalMeSnapshot } from "@/lib/mgr/portal-me-view";

const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const SHIP_MAIN = "00000000-0000-4000-8000-0000000000s1";
const SHIP_DOCK = "00000000-0000-4000-8000-0000000000s2";
const USER = "00000000-0000-4000-8000-0000000000u1";

/** Ridgeline: two ship-tos, this login, 38 × ½ bbl on deposit. */
export const portalAccountRidgeline: PortalAccountSnapshot = {
  customer: { id: CUSTOMER, name: RIDGELINE.name },
  shipTos: [
    { id: SHIP_MAIN, label: "Main", city: "Phoenixville", state: "PA" },
    { id: SHIP_DOCK, label: "Dock", city: "Royersford", state: "PA" },
  ],
  membership: { userId: USER },
  deposits: [{ kegSize: "½ bbl", kegsOnDeposit: 38, depositCents: 114000 }],
};

/** Jordan at Ridgeline — inventory Portal Me, not imported from screens.tsx. */
export const portalMeRidgeline: PortalMeSnapshot = {
  email: "jordan@ridgelinetap.com",
  account: RIDGELINE.name,
};
