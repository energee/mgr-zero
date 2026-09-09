"use client";
import { createContext, useContext } from "react";
import type { CommandContextExpectation } from "@/lib/commands/registry";

const BreweryContext = createContext<CommandContextExpectation>({ actorId: "", breweryId: "" });

export const useBrewery = () => useContext(BreweryContext).breweryId ?? "";
export const useCommandContext = () => useContext(BreweryContext);

export function BreweryProvider({ id, actorId, customerId, children }: { id: string; actorId: string; customerId?: string; children: React.ReactNode }) {
  return <BreweryContext.Provider value={{ actorId, breweryId: id, ...(customerId ? { customerId } : {}) }}>{children}</BreweryContext.Provider>;
}
