import type { Database as GeneratedDatabase } from "./database.generated";

import type { RpcResults } from "./rpc-results";

export type { Json } from "./database.generated";

type Tables = GeneratedDatabase["public"]["Tables"];
type LedgerInsert = Tables["inventory_movements"]["Insert"];
type Views = GeneratedDatabase["public"]["Views"];
type NonNullStockView = "on_hand" | "bin_on_hand" | "atp";
type Functions = GeneratedDatabase["public"]["Functions"];
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Functions" | "Views" | "Tables"> & {
    // enforce_bbl_integrity derives both fields on INSERT.
    Tables: Omit<Tables, "inventory_movements"> & { inventory_movements: Omit<Tables["inventory_movements"], "Insert"> & {
      Insert: Omit<LedgerInsert, "bbl" | "package_type"> & Partial<Pick<LedgerInsert, "bbl" | "package_type">>;
    } };
    // These stock views group non-null keys/quantities or coalesce totals.
    Views: { [Name in keyof Views]: Name extends NonNullStockView
      ? Omit<Views[Name], "Row"> & { Row: { [Col in keyof Views[Name]["Row"]]: NonNullable<Views[Name]["Row"][Col]> } }
      : Views[Name] };
    // Postgres accepts NULL for function arguments; the generator does not encode
    // argument nullability. Domain requirements remain enforced inside each RPC.
    Functions: {
      [Name in keyof Functions]: Omit<Functions[Name], "Args" | "Returns"> & {
        Returns: Name extends keyof RpcResults ? RpcResults[Name] : Functions[Name]["Returns"];
        Args: { [Arg in keyof Functions[Name]["Args"]]: Functions[Name]["Args"][Arg] | null | (Name extends "reattribute_loss" ? Arg extends "p_bbl" ? string : never : never) };
      };
    };
  };
};
