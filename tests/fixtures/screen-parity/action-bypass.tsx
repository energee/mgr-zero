import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";

function ExampleView({ footer, action }: { footer: ReactNode; action: ReactNode }) {
  return <>{footer}{action}</>;
}

export default function IndependentSlots() {
  return <ExampleView
    footer={<form>{E.edit("Independent field", "")}<button>Save</button></form>}
    action={<table><tbody><tr><td>Independent table</td></tr></tbody></table>}
  />;
}
