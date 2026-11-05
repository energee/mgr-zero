// lib/mgr/customers-view.ts — view-model for the Customers list: one fact per
// column of its RecordTable (components/mgr/views/customers.tsx).
import type { EmptyState } from "./empty-state";
import { countryName, nameWithAlias, paymentTermLabel, sentenceCase } from "./labels";
export type CustomersRowView = {
  key: string;
  title: string;
  type: string;
  /** A US customer's state; any other customer's country. */
  region: string;
  channel?: string;
  terms?: string;
  /** Inventory only: portal users or the remit warning, under the name. */
  note?: string;
  warning?: boolean;
};

export type CustomersViewModel = {
  rows: CustomersRowView[];
  empty?: EmptyState;
  missingPortalEmail?: boolean;
};

export type CustomersSnapshot = {
  missingPortalEmail?: boolean;
  /** A search is on, so an empty list means no match, not no customers. */
  filtered?: boolean;
  customers: {
    id: string;
    name: string;
    /** Staff-only; the title reads "name · alias". */
    alias?: string | null;
    type: string;
    /** ISO code. Only a US customer has a state. */
    country: string;
    state: string | null;
    payment_terms: string | null;
    sale_channels: { name: string } | null;
    /** Inventory: portal membership count. Live omits this. */
    portal_user_count?: number;
    /** Inventory: "brewery remits" warning copy. Live omits this. */
    remit?: string;
  }[];
};

export function toCustomersViewProps({ customers, missingPortalEmail, filtered }: CustomersSnapshot): CustomersViewModel {
  return {
    missingPortalEmail,
    empty: customers.length > 0 ? undefined
      : filtered ? { title: "No customers match" }
      : missingPortalEmail ? { title: "All customers have a portal login email" }
      : { title: "No customers yet" },
    rows: customers.map((c) => ({
      key: c.id,
      title: nameWithAlias(c),
      type: sentenceCase(c.type),
      region: c.country === "US" ? c.state ?? "" : countryName(c.country),
      channel: c.sale_channels?.name,
      terms: c.payment_terms ? paymentTermLabel(c.payment_terms) : undefined,
      note: c.portal_user_count != null ? `${c.portal_user_count} portal users` : c.remit,
      warning: Boolean(c.remit),
    })),
  };
}
