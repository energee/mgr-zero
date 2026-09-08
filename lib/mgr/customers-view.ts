// lib/mgr/customers-view.ts — view-model for the Customers list.
export type CustomersRowView = {
  key: string;
  title: string;
  detail: string;
  href: string;
  warning?: boolean;
};

export type CustomersViewModel = {
  rows: CustomersRowView[];
  empty?: string;
};

export type CustomersSnapshot = {
  customers: {
    id: string;
    name: string;
    type: string;
    state: string;
    payment_terms: string | null;
    sale_channels: { name: string } | null;
    /** Inventory: portal membership count. Live omits this. */
    portal_user_count?: number;
    /** Inventory: "brewery remits" warning copy. Live omits this. */
    remit?: string;
  }[];
};

function detail(c: CustomersSnapshot["customers"][number]): string {
  const head = `${c.type} · ${c.state}`;
  if (c.portal_user_count != null) return `${head} · ${c.portal_user_count} portal users`;
  if (c.remit) return `${head} · ${c.remit}`;
  const channel = c.sale_channels?.name;
  const terms = c.payment_terms;
  const tail = [channel, terms].filter(Boolean).join(" · ");
  return tail ? `${head} · ${tail}` : head;
}

export function toCustomersViewProps({ customers }: CustomersSnapshot): CustomersViewModel {
  return {
    empty: customers.length === 0 ? "No customers yet" : undefined,
    rows: customers.map((c) => ({
      key: c.id,
      title: c.name,
      detail: detail(c),
      href: `/customers/${c.id}`,
      warning: Boolean(c.remit),
    })),
  };
}
