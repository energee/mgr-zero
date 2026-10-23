// lib/mgr/materials-view.ts — the note every empty Material picker shows.
import type { PickEmpty } from "@/components/mgr/e";

/** The note under an empty Material picker (New PO, New contract, recipe
 *  ingredient). Every role that opens those forms may add a material, so it
 *  always links Materials; with no `href` (the screen inventory) the link is inert. */
export const noMaterialsPick = (href?: string): PickEmpty => ({ text: "No materials yet.", label: "Add a material", href, to: "Materials on hand" });
