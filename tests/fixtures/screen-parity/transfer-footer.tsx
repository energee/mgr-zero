import { TransferDetailView, type TransferDetailViewModel } from "@/components/mgr/views/transfer-detail";

export default function TransferFooterBypass({ model }: { model: TransferDetailViewModel }) {
  return <TransferDetailView model={model} footer={<div>A separate live footer</div>} />;
}
