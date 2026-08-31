"use client";
import { createContext, useContext } from "react";

const BreweryContext = createContext<string>("");

export const useBrewery = () => useContext(BreweryContext);

export function BreweryProvider({ id, children }: { id: string; children: React.ReactNode }) {
  return <BreweryContext.Provider value={id}>{children}</BreweryContext.Provider>;
}
