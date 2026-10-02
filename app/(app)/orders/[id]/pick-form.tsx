"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useCommandContext } from "@/app/(app)/brewery-provider";
import { useRouter } from "next/navigation";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { PickView } from "@/components/mgr/views/pick";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { isNumber } from "@/lib/mgr/quantity-input";
import { pickCountDraftKey, readPickCounts, savePickCounts } from "@/lib/mgr/pick-counts";
import { toPickViewProps, type PickSnapshot } from "@/lib/mgr/pick-view";

export function PickForm({ snapshot }: { snapshot: PickSnapshot }) {
  const router = useRouter();
  const key = pickCountDraftKey(useCommandContext(), snapshot.order.id);
  const [qtys, setQtys] = useState(() => readPickCounts(snapshot.lines, null));
  const committed = useRef(false);
  const [saved, setSaved] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [needsCounts, setNeedsCounts] = useState<string[]>([]);
  const working = useRef({ key, lines: snapshot.lines, values: qtys, restored: false });
  const { busy, error, setError, run } = useCommandAction();
  useEffect(() => {
    const restore = () => {
      try {
        const values = readPickCounts(snapshot.lines, sessionStorage.getItem(key));
        working.current = { key, lines: snapshot.lines, values, restored: true };
        setQtys(values);
        setDraftError(null); setNeedsCounts([]);
      } catch { setDraftError("Working counts could not be restored. Re-enter every line before saving."); setNeedsCounts(snapshot.lines.map(line => line.id)); }
    };
    if (!working.current.restored || working.current.key !== key) restore();
    else {
      // A same-page server refresh must not replace newer in-memory edits after a storage failure.
      const previous = working.current;
      const values = readPickCounts(snapshot.lines, JSON.stringify(Object.fromEntries(previous.lines.map(line => [line.id, {
        value: previous.values[line.id], ordered: line.qty_ordered, picked: line.qty_picked, shortPickEventId: line.shortPickEventId,
      }]))));
      working.current = { key, lines: snapshot.lines, values, restored: true };
      setQtys(values);
    }
    setNeedsCounts(previous => previous.filter(id => snapshot.lines.some(line => line.id === id)));
    // BFCache already preserves this component's newer observations, even if writing them failed.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setQtys(working.current.values);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [key, snapshot.lines, setError]);
  function short(id: string) {
    try { savePickCounts(sessionStorage, key, snapshot.lines, working.current.values); setDraftError(null); }
    catch { return setDraftError("Working counts could not be kept. Stay on Pick and try again."); }
    router.push(`/orders/${snapshot.order.id}/short-pick?line=${encodeURIComponent(id)}&qty=${encodeURIComponent(qtys[id])}`);
  }
  function retire() {
    sessionStorage.removeItem(key);
  }
  const model = toPickViewProps({ ...snapshot, lines: snapshot.lines.map(line => ({ ...line, qty_picked: Number(qtys[line.id]) })) });
  return <form className="contents" onClickCapture={event => {
    // The explicit order-back link abandons this working pick; Short's back link does not.
    if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0 && snapshot.backHref && (event.target as Element).closest("a")?.getAttribute("href") === snapshot.backHref) {
      try { retire(); }
      catch { event.preventDefault(); setError("Working counts could not be discarded. Try again."); }
    }
  }} onSubmit={event => {
    event.preventDefault();
    if (committed.current || busy || needsCounts.length) return;
    // A cleared field is not a count of 0 (#433).
    if (!snapshot.lines.every(line => isNumber(qtys[line.id] ?? ""))) return setError("Enter a picked quantity for every line.");
    void run("record_pick", { orderId: snapshot.order.id, picks: snapshot.lines.map(line => ({ lineId: line.id, qty: Number(qtys[line.id]) })) }, () => {
      committed.current = true; setSaved(true);
      try { retire(); }
      catch { toast.error("Pick saved, but working counts could not be cleared. Reopen Pick to check the saved quantities."); }
      router.push(`/orders/${snapshot.order.id}`);
    });
  }}>
    <PickView model={model} quantities={qtys} onQuantity={(id, value) => {
        const next = { ...working.current.values, [id]: value };
        working.current = { key, lines: snapshot.lines, values: next, restored: true };
        setQtys(next);
        setNeedsCounts(prev => prev.filter(lineId => lineId !== id));
        try { savePickCounts(sessionStorage, key, snapshot.lines, next); setDraftError(null); }
        catch { setDraftError("Working counts could not be kept. Stay on Pick and try again."); }
      }}
      onShort={short}
      onPrint={() => window.print()} submitting={busy || saved} disabled={needsCounts.length > 0} messages={<CommandFormMessage error={error ?? (needsCounts.length ? "Re-enter every line before saving." : draftError)} />} />
  </form>;
}
