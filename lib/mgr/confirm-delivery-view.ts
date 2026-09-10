// lib/mgr/confirm-delivery-view.ts — view-model for Confirm delivery.
export type ConfirmDeliveryLineView = { key: string; title: string; qty: string };

export type ConfirmDeliveryViewModel = {
  backHref?: string;
  backTo?: string;
  title: string;
  heading: string;
  shipTo?: string;
  invoiceTiming: string;
  lines: ConfirmDeliveryLineView[];
  receivedBy?: string;
  receivedSuggestions?: string[];
};

export function toConfirmDeliveryViewProps(s: ConfirmDeliveryViewModel): ConfirmDeliveryViewModel {
  return s;
}
