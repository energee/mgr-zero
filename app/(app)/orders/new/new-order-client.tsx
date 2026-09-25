"use client";

import { E } from "@/components/mgr/e";
import { QueryFeedback } from "@/components/mgr/query-feedback";
import { useCommandQuery } from "@/components/mgr/query-provider";
import { toSkuOption } from "@/lib/order-form-rules";
import { OrderForm, type CustomerOption, type LocationOption, type SkuRow } from "../order-form";

export function NewOrderClient() {
  const customers = useCommandQuery<CustomerOption[]>("list_customers", { includeShipTos: true });
  const locations = useCommandQuery<LocationOption[]>("list_locations", {});
  const skus = useCommandQuery<SkuRow[]>("list_skus", {});
  const error = customers.error ?? locations.error ?? skus.error;
  const paused = customers.isPaused || locations.isPaused || skus.isPaused;
  const fetching = customers.isFetching || locations.isFetching || skus.isFetching;
  const retry = () => { void customers.refetch(); void locations.refetch(); void skus.refetch(); };
  if (!customers.data || !locations.data || !skus.data) return <>
    {E.hd("New order")}
    <QueryFeedback error={error} loading="Loading order options" paused={paused} retry={retry} />
  </>;
  return <OrderForm
    feedback={<QueryFeedback error={error} fetching={fetching} paused={paused} updatedAt={Math.min(customers.dataUpdatedAt, locations.dataUpdatedAt, skus.dataUpdatedAt)} retry={retry} />}
    customers={customers.data} locations={locations.data} skus={skus.data.filter(sku => sku.active).map(toSkuOption)}
  />;
}
