import type { Database as GeneratedDatabase } from "./database.generated";

import type { RpcResults } from "./rpc-results";

export type { Json } from "./database.generated";

type Tables = GeneratedDatabase["public"]["Tables"];
type TriggerInsert<Name extends keyof Tables, Columns extends keyof Tables[Name]["Insert"]> =
  Omit<Tables[Name], "Insert"> & {
    Insert: Omit<Tables[Name]["Insert"], Columns> & Partial<Pick<Tables[Name]["Insert"], Columns>>;
  };
type Views = GeneratedDatabase["public"]["Views"];
type NonNullStockView = "on_hand" | "bin_on_hand" | "atp" | "inventory_value" | "order_line_cogs";
type Functions = GeneratedDatabase["public"]["Functions"];
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Functions" | "Views" | "Tables"> & {
    // INSERT triggers derive ledger quantities and brewery-local document dates.
    Tables: Omit<Tables, "inventory_movements" | "invoices" | "receipts" | "material_counts"> & {
      inventory_movements: TriggerInsert<"inventory_movements", "bbl" | "package_type" | "occurred_on">;
      invoices: TriggerInsert<"invoices", "issued_on">;
      receipts: TriggerInsert<"receipts", "received_on">;
      material_counts: TriggerInsert<"material_counts", "counted_on">;
    };
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
