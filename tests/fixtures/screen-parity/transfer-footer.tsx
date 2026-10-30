import { TransferDetailView } from "@/components/mgr/views/transfer-detail";
import type { TransferDetailViewModel } from "@/lib/mgr/transfer-detail-view";

export default function TransferFooterBypass({ model }: { model: TransferDetailViewModel }) {
  return <TransferDetailView model={model} footer={<div>A separate live footer</div>} />;
}
