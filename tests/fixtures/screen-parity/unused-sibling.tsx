import { ExampleView } from "./example-view";

export function UnusedSibling() {
  return <ExampleView />;
}

export default function LivePage() {
  return <div>separate live drawing</div>;
}
