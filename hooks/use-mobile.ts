// hooks/use-mobile.ts — shadcn's Sidebar hook, reworked on
// useSyncExternalStore so it needs no effect (the generated version fails
// react-hooks/set-state-in-effect). Same 768px breakpoint as Tailwind md.
// One MediaQueryList is shared by every consumer (getSnapshot runs on every
// render, so creating one per call would allocate per render).
import * as React from "react"

const MOBILE_BREAKPOINT = 768
let mql: MediaQueryList | undefined
const query = () => (mql ??= window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`))

export function useIsMobile() {
  return React.useSyncExternalStore(
    (onChange) => {
      query().addEventListener("change", onChange)
      return () => query().removeEventListener("change", onChange)
    },
    () => query().matches,
    () => false
  )
}
