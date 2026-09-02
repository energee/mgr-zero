// components/mgr-icon.tsx — in-app MGR mark. Geometry lives in lib/mgr-icon.ts
// so the favicon (app/icon.svg) and this component cannot drift.
import { MGR_ICON_PATH, MGR_ICON_VIEWBOX } from "@/lib/mgr-icon";

export function MgrIcon({
  className,
  size = 24,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      role="img"
      aria-label="MGR"
      width={size}
      height={size}
      viewBox={MGR_ICON_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <title>MGR</title>
      <path fill="currentColor" fillRule="evenodd" d={MGR_ICON_PATH} />
    </svg>
  );
}
