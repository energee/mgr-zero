import type { ReactNode } from "react";

function ShopView({ catalog }: { catalog?: ReactNode }) {
  return <>{catalog}</>;
}

export default function WrongAdditionalOwner() {
  return <ShopView catalog={<table><tbody><tr><td>Independent catalog</td></tr></tbody></table>} />;
}
