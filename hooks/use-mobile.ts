// hooks/use-mobile.ts — shadcn's Sidebar hook, reworked on
// useSyncExternalStore so it needs no effect (the generated version fails
// react-hooks/set-state-in-effect). Same 768px breakpoint as Tailwind md.
import * as React from "react"

const MOBILE_BREAKPOINT = 768
const query = () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)

export function useIsMobile() {
  return React.useSyncExternalStore(
    (onChange) => {
      const mql = query()
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => query().matches,
    () => false
  )
}
