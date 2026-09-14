"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { commandQueryOptions, createQueryClient, subscribeToCommandChanges, type QueryScope } from "@/lib/commands/query-cache";

const Scope = createContext<QueryScope | null>(null);

/** The layout keys this provider by actor/brewery/role. No cache survives a scope change. */
export function CommandQueryProvider({ scope, children }: React.PropsWithChildren<{ scope: QueryScope }>) {
  const [client] = useState(createQueryClient);
  useEffect(() => {
    const unsubscribe = subscribeToCommandChanges(client, scope);
    return () => { unsubscribe(); client.clear(); };
  }, [client, scope.actorId, scope.breweryId, scope.customerId, scope.role]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Scope.Provider value={scope}><QueryClientProvider client={client}>{children}</QueryClientProvider></Scope.Provider>;
}

export function useCommandQuery<T>(name: Parameters<typeof commandQueryOptions>[1], input: unknown, enabled = true) {
  const scope = useContext(Scope);
  if (!scope) throw new Error("CommandQueryProvider is missing");
  return useQuery({ ...commandQueryOptions<T>(scope, name, input), enabled });
}
