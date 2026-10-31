import type { ReactNode } from "react";
import { TransferDetailView as SharedTransferDetailView } from "@/components/mgr/views/transfer-detail";
import type { TransferDetailViewModel } from "@/lib/mgr/transfer-detail-view";

// Parser input modelling a retired slot, not a product component.
function TransferDetailView({ footer }: { footer: ReactNode }) {
  return <section>{footer}</section>;
}

export default function TransferFooterBypass() {
  return <TransferDetailView footer={<div>A separate live footer</div>} />;
}

export function TransferDelegation({ model }: { model: TransferDetailViewModel }) {
  return <SharedTransferDetailView model={model} />;
}
