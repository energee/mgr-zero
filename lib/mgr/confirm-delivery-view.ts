// lib/mgr/confirm-delivery-view.ts — view-model for Confirm delivery.
import type { ShipToSnapshot } from "./ship-to-view";

export type ConfirmDeliveryLineView = { key: string; title: string; qty: string };

export type ConfirmDeliveryViewModel = {
  backHref?: string;
  backTo?: string;
  title: string;
  heading: string;
  /** Undefined for an internal transfer; null for an unrecorded customer destination. */
  shipTo?: ShipToSnapshot | null;
  invoiceTiming: string;
  lines: ConfirmDeliveryLineView[];
  receivedBy?: string;
  receivedSuggestions?: string[];
};
