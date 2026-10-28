"use client";

import { E } from "@/components/mgr/e";
import { QueryFeedback } from "@/components/mgr/query-feedback";
import { useCommandQuery } from "@/components/mgr/query-provider";
import { toSkuOption } from "@/lib/order-form-rules";
import { OrderForm, type CustomerOption, type LocationOption, type SkuRow } from "../order-form";

export function NewOrderClient({ timeZone, customerId }: { timeZone: string; customerId?: string }) {
  const customers = useCommandQuery<CustomerOption[]>("list_customers", { includeShipTos: true });
  const locations = useCommandQuery<LocationOption[]>("list_locations", {});
  const skus = useCommandQuery<SkuRow[]>("list_skus", {});
  // Its portal fulfillment warehouse is Source's starting choice among several locations (#1506).
  const brewery = useCommandQuery<{ portal_fulfillment_location_id: string | null }>("get_brewery", {});
  const error = customers.error ?? locations.error ?? skus.error ?? brewery.error;
  const paused = customers.isPaused || locations.isPaused || skus.isPaused || brewery.isPaused;
  const fetching = customers.isFetching || locations.isFetching || skus.isFetching || brewery.isFetching;
  const retry = () => { void customers.refetch(); void locations.refetch(); void skus.refetch(); void brewery.refetch(); };
  if (!customers.data || !locations.data || !skus.data || !brewery.data) return <>
    {E.hd("New order")}
    <QueryFeedback timeZone={timeZone} error={error} loading="Loading order options" paused={paused} retry={retry} />
  </>;
  return <OrderForm timeZone={timeZone} linkedCustomerId={customerId} fulfillmentLocationId={brewery.data.portal_fulfillment_location_id}
    feedback={<QueryFeedback timeZone={timeZone} showCheckedAt={false} error={error} fetching={fetching} paused={paused} updatedAt={Math.min(customers.dataUpdatedAt, locations.dataUpdatedAt, skus.dataUpdatedAt, brewery.dataUpdatedAt)} retry={retry} />}
    customers={customers.data} locations={locations.data} skus={skus.data.filter(sku => sku.active).map(toSkuOption)}
  />;
}
