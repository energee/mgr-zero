// lib/mgr/customers-view.ts — view-model for the Customers list.
import type { EmptyState } from "./empty-state";
import { countryName, nameWithAlias, paymentTermLabel, sentenceCase } from "./labels";
export type CustomersRowView = {
  key: string;
  title: string;
  detail: string;
  href: string;
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

function detail(c: CustomersSnapshot["customers"][number]): string {
  // A US customer reads its state; any other its country.
  const head = `${sentenceCase(c.type)} · ${c.country === "US" ? c.state : countryName(c.country)}`;
  if (c.portal_user_count != null) return `${head} · ${c.portal_user_count} portal users`;
  if (c.remit) return `${head} · ${c.remit}`;
  const channel = c.sale_channels?.name;
  const terms = c.payment_terms && paymentTermLabel(c.payment_terms);
  const tail = [channel, terms].filter(Boolean).join(" · ");
  return tail ? `${head} · ${tail}` : head;
}

export function toCustomersViewProps({ customers, missingPortalEmail, filtered }: CustomersSnapshot): CustomersViewModel {
  return {
    missingPortalEmail,
    empty: customers.length > 0 ? undefined
      : filtered ? { title: "No customers match", description: "Clear the search to see every customer." }
      : missingPortalEmail ? { title: "All customers have a portal login email", description: "No customer accounts need an email added through portal access." }
      : { title: "No customers yet", description: "Add the accounts you sell to so orders have somewhere to go." },
    rows: customers.map((c) => ({
      key: c.id,
      title: nameWithAlias(c),
      detail: detail(c),
      href: `/customers/${c.id}`,
      warning: Boolean(c.remit),
    })),
  };
}
