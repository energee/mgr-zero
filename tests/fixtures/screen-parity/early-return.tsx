// A view that picks a second layout with an early return: the guard in
// tests/screen-view-composition.test.ts must flag line 5 and pass the null guard.
export function EarlyReturnView({ live, empty }: { live?: boolean; empty?: boolean }) {
  if (empty) return null;
  if (live) return <div>live layout</div>;
  return <div>inventory layout</div>;
}
