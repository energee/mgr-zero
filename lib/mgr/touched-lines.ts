// lib/mgr/touched-lines.ts — which repeated form lines the user has left, so a
// line's field errors wait until its quantity loses focus instead of
// interrupting the typing (#1121). Shared by New order, Edit draft, New PO and
// New transfer. Record movement has fields, not lines, so it keys each field
// as a named slot (QTY, DEST_STATE in components/mgr/views/record-movement.tsx)
// and touches it on that field's blur. An inventory fixture has no live fields
// to leave, so its errors show at once: the fixture is the state it depicts.
import { useState } from "react";

/** The touched set after line `index` is removed: later lines move up one. */
export function withoutLine(touched: ReadonlySet<number>, index: number): Set<number> {
  return new Set([...touched].filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)));
}

/** `drawn` is true for an inventory fixture (no onChange). `shown(i)` says
 *  whether line i's errors are drawn; call `touch(i)` on its quantity's blur
 *  and `remove(i)` when the line is removed. */
export function useTouchedLines(drawn: boolean) {
  const [touched, setTouched] = useState<ReadonlySet<number>>(() => new Set());
  return {
    shown: (index: number) => drawn || touched.has(index),
    touch: (index: number) => setTouched((t) => (t.has(index) ? t : new Set(t).add(index))),
    remove: (index: number) => setTouched((t) => withoutLine(t, index)),
  };
}
