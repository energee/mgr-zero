"use client";

import { E } from "@/components/mgr/e";
import { QueryFeedback } from "@/components/mgr/query-feedback";
import { useCommandQuery } from "@/components/mgr/query-provider";
import { OrderForm, type CustomerOption, type LocationOption } from "../order-form";

type Sku = { id: string; name: string; active: boolean; brands: { name: string } | null };

export function NewOrderClient() {
  const customers = useCommandQuery<CustomerOption[]>("list_customers", { includeShipTos: true });
  const locations = useCommandQuery<LocationOption[]>("list_locations", {});
  const skus = useCommandQuery<Sku[]>("list_skus", {});
  const error = customers.error ?? locations.error ?? skus.error;
  const retry = () => { void customers.refetch(); void locations.refetch(); void skus.refetch(); };
  if (!customers.data || !locations.data || !skus.data) return <>
    {E.hd("New order")}
    <QueryFeedback error={error} loading="Loading order options" retry={retry} />
  </>;
  return <>
    <QueryFeedback error={error} retry={retry} />
    <OrderForm customers={customers.data} locations={locations.data} skus={skus.data.filter(sku => sku.active).map(sku => ({ id: sku.id, label: sku.brands ? `${sku.brands.name} — ${sku.name}` : sku.name }))} />
  </>;
}
