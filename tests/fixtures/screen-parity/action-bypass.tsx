import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";

function ExampleView({ footer, action }: { footer: ReactNode; action: ReactNode }) {
  return <>{footer}{action}</>;
}

function TodayView({ footer }: { footer: ReactNode }) {
  return <>{footer}</>;
}

function ForwardedToday({ footer }: { footer: ReactNode }) {
  return <TodayView footer={footer} />;
}

function IndependentTable() {
  const table = <table><tbody><tr><td>Independent table</td></tr></tbody></table>;
  return table;
}

function ControlAdapter({ control: Control }: { control: () => ReactNode }) {
  return <Control />;
}

function RenderFooter({ render, table = false }: { render: (value: { footer: ReactNode }) => ReactNode; table?: boolean }) {
  let footer: ReactNode;
  if (table) footer = <IndependentTable />;
  else footer = <form>{E.pick("Hidden choice", "", [])}</form>;
  return render({ footer });
}

export default function IndependentSlots() {
  const form = <form>{E.edit("Independent field", "")}<button>Save</button></form>;
  const alias = form;
  const forms = [0].map(() => alias);
  return <>
    <ExampleView footer={forms} action={<ControlAdapter control={IndependentTable} />} />
    <ForwardedToday footer={<form>{E.edit("Hidden Today field", "")}</form>} />
    <RenderFooter render={value => <TodayView footer={value.footer} />} />
  </>;
}
