// lib/mgr/fixtures/me.ts — staff Me snapshot (Maria, admin).
import type { MeViewModel } from "@/lib/mgr/me-view";

export const meMaria: MeViewModel = {
  name: "Maria Alvarez",
  role: "admin",
  email: "maria@demobrewing.com",
  breweries: [
    { name: "Demo Brewing", current: true },
    { name: "Ridgeline Contract Brewing", current: false },
  ],
};
