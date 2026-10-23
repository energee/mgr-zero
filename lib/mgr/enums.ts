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

/** Every staff role, in the database enum's display order. */
export const STAFF_ROLES = ["admin", "sales", "warehouse", "brewer", "taproom"] as const;

// Kegs (lib/commands/taproom.ts).
export const KEG_SIZES = ["half_bbl", "quarter_bbl", "sixth_bbl", "fifty_l", "thirty_l", "twenty_l"] as const;
export const KEG_POOL_KINDS = ["owned", "leased", "pay_per_fill"] as const;
/** The reasons staff record by hand; transferred_in/out come from transfers and bin moves in pairs. */
export const KEG_EVENT_REASONS = ["acquired", "retired", "shipped", "returned", "lost", "found"] as const;

// Customer rejection reasons; unattempted stops use leave_delivery_for_later.
export const REFUSAL_REASONS = ["customer_refused", "damaged", "wrong_item", "other"] as const;

// The process spec (recipe-builder spec D2, D6, D7), from lib/commands/production.ts:
// ordered mash steps and fermentation stages, each with a type and a name, and
// water additions carrying one stage.
export const MASH_STEP_KINDS = ["infusion", "decoction", "direct heat", "rest"] as const;
export const FERMENTATION_STAGE_KINDS = ["primary", "secondary", "diacetyl rest", "cold crash", "conditioning", "lagering", "custom"] as const;
export const WATER_ADDITION_STAGES = ["mash", "sparge", "kettle"] as const;
export const WATER_ADDITION_UNITS = ["g", "mL", "oz"] as const;

// Location uses (location_kind enum; lib/commands/catalog.ts and inventory.ts,
// the location fields). A place may have several; guards test membership.
export const LOCATION_USES = ["warehouse", "taproom", "storage"] as const;
export type LocationUse = (typeof LOCATION_USES)[number];

// Customer types (customer_type enum; lib/commands/customers.ts, the customer forms).
export const CUSTOMER_TYPES = ["distributor", "retailer", "brewery", "other"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

// Payment terms, one list for customers and vendors (#491; lib/commands/customers.ts,
// lib/commands/purchasing.ts, lib/import-csv.ts). Customer terms freeze invoice
// due_on at insert (issue date + 0/15/30 days); vendor terms are display-only.
// Labels: PAYMENT_TERM_LABEL in lib/mgr/labels.ts.
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

// Countries: every ISO 3166-1 alpha-2 code (249) and the English name staff
// pick it by. customers.country and ship_tos.country store the code, default
// US; only a US customer or ship-to has a state (lib/commands/customers.ts,
// lib/import-csv.ts, the customer and ship-to views).
export const COUNTRY_NAMES = {
  AD: "Andorra", AE: "United Arab Emirates", AF: "Afghanistan", AG: "Antigua and Barbuda", AI: "Anguilla",
  AL: "Albania", AM: "Armenia", AO: "Angola", AQ: "Antarctica", AR: "Argentina", AS: "American Samoa",
  AT: "Austria", AU: "Australia", AW: "Aruba", AX: "Åland Islands", AZ: "Azerbaijan",
  BA: "Bosnia and Herzegovina", BB: "Barbados", BD: "Bangladesh", BE: "Belgium", BF: "Burkina Faso",
  BG: "Bulgaria", BH: "Bahrain", BI: "Burundi", BJ: "Benin", BL: "Saint Barthélemy", BM: "Bermuda",
  BN: "Brunei", BO: "Bolivia", BQ: "Caribbean Netherlands", BR: "Brazil", BS: "Bahamas", BT: "Bhutan",
  BV: "Bouvet Island", BW: "Botswana", BY: "Belarus", BZ: "Belize", CA: "Canada", CC: "Cocos (Keeling) Islands",
  CD: "Congo (DRC)", CF: "Central African Republic", CG: "Congo (Republic)", CH: "Switzerland",
  CI: "Côte d’Ivoire", CK: "Cook Islands", CL: "Chile", CM: "Cameroon", CN: "China", CO: "Colombia",
  CR: "Costa Rica", CU: "Cuba", CV: "Cape Verde", CW: "Curaçao", CX: "Christmas Island", CY: "Cyprus",
  CZ: "Czechia", DE: "Germany", DJ: "Djibouti", DK: "Denmark", DM: "Dominica", DO: "Dominican Republic",
  DZ: "Algeria", EC: "Ecuador", EE: "Estonia", EG: "Egypt", EH: "Western Sahara", ER: "Eritrea", ES: "Spain",
  ET: "Ethiopia", FI: "Finland", FJ: "Fiji", FK: "Falkland Islands", FM: "Micronesia", FO: "Faroe Islands",
  FR: "France", GA: "Gabon", GB: "United Kingdom", GD: "Grenada", GE: "Georgia", GF: "French Guiana",
  GG: "Guernsey", GH: "Ghana", GI: "Gibraltar", GL: "Greenland", GM: "Gambia", GN: "Guinea", GP: "Guadeloupe",
  GQ: "Equatorial Guinea", GR: "Greece", GS: "South Georgia and the South Sandwich Islands", GT: "Guatemala",
  GU: "Guam", GW: "Guinea-Bissau", GY: "Guyana", HK: "Hong Kong", HM: "Heard Island and McDonald Islands",
  HN: "Honduras", HR: "Croatia", HT: "Haiti", HU: "Hungary", ID: "Indonesia", IE: "Ireland", IL: "Israel",
  IM: "Isle of Man", IN: "India", IO: "British Indian Ocean Territory", IQ: "Iraq", IR: "Iran", IS: "Iceland",
  IT: "Italy", JE: "Jersey", JM: "Jamaica", JO: "Jordan", JP: "Japan", KE: "Kenya", KG: "Kyrgyzstan",
  KH: "Cambodia", KI: "Kiribati", KM: "Comoros", KN: "Saint Kitts and Nevis", KP: "North Korea",
  KR: "South Korea", KW: "Kuwait", KY: "Cayman Islands", KZ: "Kazakhstan", LA: "Laos", LB: "Lebanon",
  LC: "Saint Lucia", LI: "Liechtenstein", LK: "Sri Lanka", LR: "Liberia", LS: "Lesotho", LT: "Lithuania",
  LU: "Luxembourg", LV: "Latvia", LY: "Libya", MA: "Morocco", MC: "Monaco", MD: "Moldova", ME: "Montenegro",
  MF: "Saint Martin", MG: "Madagascar", MH: "Marshall Islands", MK: "North Macedonia", ML: "Mali",
  MM: "Myanmar", MN: "Mongolia", MO: "Macao", MP: "Northern Mariana Islands", MQ: "Martinique",
  MR: "Mauritania", MS: "Montserrat", MT: "Malta", MU: "Mauritius", MV: "Maldives", MW: "Malawi", MX: "Mexico",
  MY: "Malaysia", MZ: "Mozambique", NA: "Namibia", NC: "New Caledonia", NE: "Niger", NF: "Norfolk Island",
  NG: "Nigeria", NI: "Nicaragua", NL: "Netherlands", NO: "Norway", NP: "Nepal", NR: "Nauru", NU: "Niue",
  NZ: "New Zealand", OM: "Oman", PA: "Panama", PE: "Peru", PF: "French Polynesia", PG: "Papua New Guinea",
  PH: "Philippines", PK: "Pakistan", PL: "Poland", PM: "Saint Pierre and Miquelon", PN: "Pitcairn Islands",
  PR: "Puerto Rico", PS: "Palestine", PT: "Portugal", PW: "Palau", PY: "Paraguay", QA: "Qatar", RE: "Réunion",
  RO: "Romania", RS: "Serbia", RU: "Russia", RW: "Rwanda", SA: "Saudi Arabia", SB: "Solomon Islands",
  SC: "Seychelles", SD: "Sudan", SE: "Sweden", SG: "Singapore", SH: "Saint Helena", SI: "Slovenia",
  SJ: "Svalbard and Jan Mayen", SK: "Slovakia", SL: "Sierra Leone", SM: "San Marino", SN: "Senegal",
  SO: "Somalia", SR: "Suriname", SS: "South Sudan", ST: "São Tomé and Príncipe", SV: "El Salvador",
  SX: "Sint Maarten", SY: "Syria", SZ: "Eswatini", TC: "Turks and Caicos Islands", TD: "Chad",
  TF: "French Southern Territories", TG: "Togo", TH: "Thailand", TJ: "Tajikistan", TK: "Tokelau",
  TL: "Timor-Leste", TM: "Turkmenistan", TN: "Tunisia", TO: "Tonga", TR: "Türkiye", TT: "Trinidad and Tobago",
  TV: "Tuvalu", TW: "Taiwan", TZ: "Tanzania", UA: "Ukraine", UG: "Uganda", UM: "U.S. Outlying Islands",
  US: "United States", UY: "Uruguay", UZ: "Uzbekistan", VA: "Vatican City", VC: "Saint Vincent and the Grenadines",
  VE: "Venezuela", VG: "British Virgin Islands", VI: "U.S. Virgin Islands", VN: "Vietnam", VU: "Vanuatu",
  WF: "Wallis and Futuna", WS: "Samoa", YE: "Yemen", YT: "Mayotte", ZA: "South Africa", ZM: "Zambia", ZW: "Zimbabwe",
} as const;
export type CountryCode = keyof typeof COUNTRY_NAMES;
export const COUNTRY_CODES = Object.keys(COUNTRY_NAMES) as [CountryCode, ...CountryCode[]];

// Catalog brand-list orders (list_brands in lib/commands/catalog.ts, ?sort= on
// /catalog). Labels: BRAND_SORT_LABEL in lib/mgr/labels.ts.
export const BRAND_SORTS = ["name", "abv", "newest"] as const;
export type BrandSort = (typeof BRAND_SORTS)[number];
