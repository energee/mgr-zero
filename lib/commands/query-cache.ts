import { QueryClient, queryOptions } from "@tanstack/react-query";
import { command, COMMAND_DATA_CHANGED, CommandResponseError } from "./client";
import type { CommandContextExpectation } from "./registry";

export type QueryScope = CommandContextExpectation & { roles?: readonly string[] };
// Only registered reads belong here. Never cache/retry a mutation as a query.
type CachedQuery = "list_orders" | "list_customers" | "list_locations" | "list_skus" | "get_brewery" | "get_packaging_material_plan" | "get_cola_image" | "suggest_material_category" | "find_similar_names";

export function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: {
    gcTime: 5 * 60_000,
    retry: (count, error) => count < 1 && !(error instanceof CommandResponseError && error.status < 500),
    throwOnError: error => error instanceof CommandResponseError && [401, 403, 409].includes(error.status),
  } } });
}

export function commandQueryOptions<T = unknown>(scope: QueryScope, name: CachedQuery, input: unknown) {
  const { roles, ...expectedContext } = scope;
  const refreshInterval = name === "list_orders" ? 5_000 : 30_000;
  // Read once per input: a label image is large, a kind suggestion is a paid model call,
  // and the names close to a typed one do not change while its form is open.
  const once = name === "get_cola_image" || name === "suggest_material_category" || name === "find_similar_names";
  return queryOptions({
    // A failed suggestion shows none (docs/plans/jev-suggestions.md); asking again would only add a model call.
    ...(name === "suggest_material_category" ? { retry: false } : {}),
    queryKey: ["command", expectedContext, roles ? roles.toSorted().join(",") : null, name, input] as const,
    queryFn: ({ signal }) => command(scope.breweryId ?? "", name, input, undefined, expectedContext, undefined, signal) as Promise<T>,
    staleTime: once ? 5 * 60_000 : refreshInterval,
    refetchInterval: once ? false : refreshInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: once ? false : "always",
    refetchOnReconnect: once ? false : "always",
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
