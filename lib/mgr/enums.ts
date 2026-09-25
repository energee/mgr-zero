// lib/mgr/enums.ts — the option arrays a client form or a shared view needs to
// draw a picker, kept apart from the command modules that validate them.
//
// Why a separate module: every `lib/commands/<area>.ts` calls `defineCommand`
// at module scope, so importing one for a single `as const` array registers
// the whole area — and drags the registry and its server-only dependencies
// into a `"use client"` bundle. These are plain data with no imports, so the
// forms and the shared views under `components/mgr/views/` can read them
// directly. The command modules re-export them, so their zod `z.enum(...)`
// schemas and the pickers stay one list. `tests/boundary.test.ts` holds the
// rule.
//
// The words operators read live elsewhere (`lib/mgr/keg-labels.ts`,
// `sentenceCase` in `lib/mgr/labels.ts`); these are the stored values.

// Kegs (lib/commands/taproom.ts).
export const KEG_SIZES = ["half_bbl", "quarter_bbl", "sixth_bbl", "fifty_l", "thirty_l", "twenty_l"] as const;
export const KEG_POOL_KINDS = ["owned", "leased", "pay_per_fill"] as const;
/** The reasons staff record by hand; transferred_in/out come from transfers and bin moves in pairs. */
export const KEG_EVENT_REASONS = ["acquired", "retired", "shipped", "returned", "lost", "found"] as const;

// The process spec (recipe-builder spec D2, D6, D7), from lib/commands/production.ts:
// ordered mash steps and fermentation stages, each with a type and a name, and
// water additions carrying one stage.
export const MASH_STEP_KINDS = ["infusion", "decoction", "direct heat", "rest"] as const;
export const FERMENTATION_STAGE_KINDS = ["primary", "secondary", "diacetyl rest", "cold crash", "conditioning", "lagering", "custom"] as const;
export const WATER_ADDITION_STAGES = ["mash", "sparge", "kettle"] as const;
export const WATER_ADDITION_UNITS = ["g", "mL", "oz"] as const;

// Payment terms, one list for customers and vendors (#491; lib/commands/customers.ts,
// lib/commands/purchasing.ts, lib/import-csv.ts). Nothing computes a due date
// from them yet. Labels: PAYMENT_TERM_LABEL in lib/mgr/labels.ts.
export const PAYMENT_TERMS = ["due_on_receipt", "net15", "net30"] as const;
export type PaymentTerm = (typeof PAYMENT_TERMS)[number];

// US state codes (USPS), plus DC and the inhabited territories, for every
// state field: customers, ship-tos, licenses, label registrations, CSV import
// (lib/commands/registry.ts `stateCode`, lib/import-csv.ts).
export const US_STATE_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND",
  "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC", "PR", "VI", "GU", "AS", "MP",
] as const;
