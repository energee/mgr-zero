// components/mgr-icon.tsx — in-app MGR mark. Geometry lives in lib/mgr-icon.ts
// so the favicon (app/icon.svg) and this component cannot drift.
import { MGR_ICON_PATH, MGR_ICON_VIEWBOX } from "@/lib/mgr-icon";

// The mark is decorative wherever it sits beside the name it stands for - both
// shells put it before the brewery/customer name, and the login form before
// "Sign in to MGR" - so labelling it made a screen reader announce "MGR" twice.
// Decorative is therefore the default; pass a label only where the mark stands
// alone and has to carry the name itself.
export function MgrIcon({
  className,
  size = 24,
  label = null,
}: {
  className?: string;
  size?: number;
  label?: string | null;
}) {
  return (
    <svg
      {...(label === null ? { "aria-hidden": true } : { role: "img", "aria-label": label })}
      width={size}
      height={size}
      viewBox={MGR_ICON_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path fill="currentColor" fillRule="evenodd" d={MGR_ICON_PATH} />
    </svg>
  );
}
