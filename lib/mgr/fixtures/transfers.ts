// lib/mgr/fixtures/transfers.ts — list_stock_transfers / get_stock_transfer
// snapshots for Transfers, New transfer, and Transfer detail. Identities
// from demo.ts. Views own no sample data.
import { LOC_WAREHOUSE, LOC_TAPROOM, SKU_HAZY, SKU_PILS } from "./demo";
import type { TransfersSnapshot } from "@/lib/mgr/transfers-view";
import type { NewTransferSnapshot } from "@/lib/mgr/new-transfer-view";
import type { TransferDetailSnapshot } from "@/lib/mgr/transfer-detail-view";

const LOC_STORAGE = { id: "00000000-0000-4000-8000-000000000003", name: "Storage" };
const TRF_7 = "00000000-0000-4000-8000-0000000000t7";
const TRF_6 = "00000000-0000-4000-8000-0000000000t6";

/** Work → Transfers: submitted pick + picked receive. */
export const transfersList: TransfersSnapshot = {
  transfers: [
    {
      id: TRF_7,
      transfer_no: 7,
      status: "submitted",
      from_name: LOC_WAREHOUSE.name,
      to_name: LOC_TAPROOM.name,
      line_count: 2,
    },
    {
      id: TRF_6,
      transfer_no: 6,
      status: "picked",
      from_name: LOC_WAREHOUSE.name,
      to_name: LOC_STORAGE.name,
      line_count: 1,
    },
  ],
};

/** New transfer sheet: Warehouse Walk-in → Taproom Cold, Hazy + Pils. */
export const newTransferDraft: NewTransferSnapshot = {
  from: LOC_WAREHOUSE.name,
  fromOptions: [LOC_WAREHOUSE.name, LOC_TAPROOM.name, LOC_STORAGE.name],
  fromBin: "Walk-in",
  fromBinOptions: ["Walk-in", "Cold", "Dry"],
  to: LOC_TAPROOM.name,
  toOptions: [LOC_TAPROOM.name, LOC_STORAGE.name],
  toBin: "Cold",
  toBinOptions: ["Walk-in", "Cold", "Dry"],
  lines: [
    { title: SKU_HAZY.name, qty: 2 },
    { title: SKU_PILS.name, qty: 4 },
  ],
};

/** TRF-0007 submitted, Record pick next. */
export const transferDetailSubmitted: TransferDetailSnapshot = {
  transfer: {
    id: TRF_7,
    transfer_no: 7,
    status: "submitted",
    from_name: LOC_WAREHOUSE.name,
    to_name: LOC_TAPROOM.name,
  },
  lines: [
    { id: "l1", name: SKU_HAZY.name, from_bin: "Walk-in", to_bin: "Cold", qty: 2 },
    { id: "l2", name: SKU_PILS.name, from_bin: "Walk-in", to_bin: "Cold", qty: 4 },
  ],
};
