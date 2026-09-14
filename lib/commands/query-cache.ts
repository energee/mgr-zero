import { QueryClient, queryOptions } from "@tanstack/react-query";
import { command, COMMAND_DATA_CHANGED, CommandResponseError } from "./client";
import type { CommandContextExpectation } from "./registry";

export type QueryScope = CommandContextExpectation & { role?: string };
// Only registered reads belong here. Never cache/retry a mutation as a query.
type CachedQuery = "list_orders" | "list_customers" | "list_locations" | "list_skus";

export function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: {
    gcTime: 5 * 60_000,
    retry: (count, error) => count < 1 && !(error instanceof CommandResponseError && error.status < 500),
    throwOnError: error => error instanceof CommandResponseError && [401, 403, 409].includes(error.status),
  } } });
}

export function commandQueryOptions<T = unknown>(scope: QueryScope, name: CachedQuery, input: unknown) {
  const { role, ...expectedContext } = scope;
  const refreshInterval = name === "list_orders" ? 5_000 : 30_000;
  return queryOptions({
    queryKey: ["command", expectedContext, role ?? null, name, input] as const,
    queryFn: ({ signal }) => command(scope.breweryId ?? "", name, input, undefined, expectedContext, undefined, signal) as Promise<T>,
    staleTime: refreshInterval,
    refetchInterval: refreshInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
}

export function subscribeToCommandChanges(client: QueryClient, scope: QueryScope) {
  const invalidate = (event: Event) => {
    if ((event as CustomEvent<{ breweryId: string }>).detail.breweryId !== scope.breweryId) return;
    // Cancel a pre-write read before it can replace the post-write result.
    void client.cancelQueries().then(() => client.invalidateQueries());
  };
  window.addEventListener(COMMAND_DATA_CHANGED, invalidate);
  return () => window.removeEventListener(COMMAND_DATA_CHANGED, invalidate);
}
