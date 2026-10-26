import Link from "next/link";

export function NotFoundView({ message, backLabel, backHref = "#", backTo }: {
  message: string;
  backLabel: string;
  backHref?: string;
  backTo?: string;
}) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-muted-foreground">{message}</p>
      <Link href={backHref} data-to={backTo} className="w-fit underline">{backLabel}</Link>
    </div>
  );
}
