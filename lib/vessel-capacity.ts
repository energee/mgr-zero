import { z } from "zod";

// vessels.capacity_bbl is numeric(10,3), with a positive check. Refuse values
// requiring rounding, including positive values that would be stored as zero.
export const VESSEL_CAPACITY_MIN = 0.001;
export const VESSEL_CAPACITY_MAX = 9_999_999.999;
export const vesselCapacity = z.number()
  .min(VESSEL_CAPACITY_MIN, "Capacity must be at least 0.001 bbl.")
  .max(VESSEL_CAPACITY_MAX, "Capacity must be at most 9,999,999.999 bbl.")
  .multipleOf(VESSEL_CAPACITY_MIN, "Use no more than 3 decimal places for capacity.");
