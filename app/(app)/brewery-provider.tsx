"use client";
import { createContext, useContext } from "react";
import type { CommandContextExpectation } from "@/lib/commands/registry";

// null, not a blank expectation: a blank actorId is truthy enough to reach the
// wire, where app/api/command/route.ts rejects it 400 after the round trip. A
// missing provider must fail here, at render, instead. Route groups do not show
// up in the URL, so moving a page out of (app)/(portal) is otherwise invisible.
const BreweryContext = createContext<CommandContextExpectation | null>(null);

export function useCommandContext() {
  const context = useContext(BreweryContext);
  if (!context) throw new Error("BreweryProvider is missing: a client component ran a command outside (app)/(portal). Mount the provider on the page.");
  return context;
}
export const useBrewery = () => useCommandContext().breweryId ?? "";

export function BreweryProvider({ id, actorId, customerId, children }: React.PropsWithChildren<{ id: string; actorId: string; customerId?: string }>) {
  return <BreweryContext.Provider value={{ actorId, breweryId: id, ...(customerId ? { customerId } : {}) }}>{children}</BreweryContext.Provider>;
}
