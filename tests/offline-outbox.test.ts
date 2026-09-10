import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CommandResponseError } from "@/lib/commands/client";
import { getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { SCREENS } from "@/components/mgr/screens";
import { FermentationReadingActionsView, FermentationReadingView } from "@/components/mgr/views/fermentation-reading";
import {
  createReadingAttempt,
  discardOutbox,
  flushOutbox,
  outboxDiscardConfirmation,
  readOutbox,
  sendOutboxAttempt,
  storeOutboxAttempt,
  visibleOutbox,
  type OfflineScope,
} from "@/lib/composer/outbox";

const ids = {
  actor: "11111111-1111-4111-8111-111111111111",
  brewery: "22222222-2222-4222-8222-222222222222",
  occupancy: "33333333-3333-4333-8333-333333333333",
  request: "44444444-4444-4444-8444-444444444444",
};
const scope: OfflineScope = { actorId: ids.actor, breweryId: ids.brewery, role: "brewer" };
const input = { occupancyId: ids.occupancy, at: "2026-09-10T14:15:16.000Z", tempF: 68, gravityPlato: 4.2, ph: 4.1, note: "steady" };

class MemoryStorage implements Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function attempt(requestId = ids.request, currentScope = scope) {
  return createReadingAttempt(currentScope, input, "Record fermentation reading · FV3", {
    requestId, capturedAt: "2026-09-10T14:15:17.000Z",
  });
}

describe("action-specific offline outbox", () => {
  it("freezes and persists the exact eligible reading before transport", async () => {
    const storage = new MemoryStorage();
    const frozen = attempt();
    storeOutboxAttempt(storage, frozen);
    const send = vi.fn(async () => ({ id: "reading" }));

    await expect(sendOutboxAttempt(storage, frozen.id, scope, send)).resolves.toMatchObject({ status: "sent" });
    expect(send).toHaveBeenCalledWith(ids.brewery, "record_fermentation_reading", input, ids.request, {
      actorId: ids.actor, breweryId: ids.brewery,
    });
    expect(readOutbox(storage)).toEqual([]);
    expect(JSON.stringify(frozen)).not.toMatch(/bearer|credential|password|access.?token/i);
    expect(getCommandDefinition("record_fermentation_reading")).toMatchObject({ idempotency: "dedupe", offlineReplay: true });
    for (const name of ["record_pick", "record_movement", "record_stock_transfer_pick", "receive_stock_transfer"]) {
      expect(getCommandDefinition(name)?.offlineReplay, name).not.toBe(true);
    }
  });

  it("does not send when durable storage fails", async () => {
    const storage = new MemoryStorage();
    storage.setItem = () => { throw new Error("quota"); };
    const send = vi.fn();
    expect(() => storeOutboxAttempt(storage, attempt())).toThrow(/save.*outbox/i);
    expect(send).not.toHaveBeenCalled();
  });

  it("validates reloads, rejects unsupported commands, and fails closed on bad JSON", () => {
    const storage = new MemoryStorage();
    const frozen = attempt();
    storeOutboxAttempt(storage, frozen);
    expect(readOutbox(storage)).toEqual([frozen]);
    expect(() => storeOutboxAttempt(storage, { ...frozen, name: "record_movement" } as unknown as typeof frozen)).toThrow(/not eligible/i);
    storage.values.set("mgr-offline-outbox:v1", "{broken");
    expect(() => readOutbox(storage)).toThrow(/could not be read/i);
  });

  it("retains transient and uncertain attempts with the original ID and observation", async () => {
    const storage = new MemoryStorage();
    storeOutboxAttempt(storage, attempt());
    const network = vi.fn(async () => { throw new TypeError("offline"); });
    await expect(sendOutboxAttempt(storage, ids.request, scope, network)).resolves.toMatchObject({ status: "uncertain" });
    expect(readOutbox(storage)[0]).toMatchObject({ requestId: ids.request, input, state: "uncertain", hadUncertainOutcome: true, attempts: 1 });

    for (const status of [401, 408, 429, 503]) {
      const transient = vi.fn(async () => { throw new CommandResponseError(`status ${status}`, status); });
      await expect(sendOutboxAttempt(storage, ids.request, scope, transient)).resolves.toMatchObject({ status: "uncertain" });
      expect(readOutbox(storage)[0]).toMatchObject({ requestId: ids.request, input, state: "uncertain", hadUncertainOutcome: true });
    }

    const laterPermanent = vi.fn(async () => { throw new CommandResponseError("occupancy is closed", 400); });
    await expect(sendOutboxAttempt(storage, ids.request, scope, laterPermanent)).resolves.toMatchObject({ status: "uncertain" });
    expect(readOutbox(storage)[0]).toMatchObject({ requestId: ids.request, input, state: "uncertain", hadUncertainOutcome: true, attempts: 6 });
  });

  it("marks a definitive first refusal Fix but never silently discards it", async () => {
    const storage = new MemoryStorage();
    storeOutboxAttempt(storage, attempt());
    const send = vi.fn(async () => { throw new CommandResponseError("occupancy is closed", 400); });
    await expect(sendOutboxAttempt(storage, ids.request, scope, send)).resolves.toMatchObject({ status: "fix" });
    expect(readOutbox(storage)[0]).toMatchObject({ requestId: ids.request, state: "fix", hadUncertainOutcome: false });
  });

  it("shows and flushes only the current identity and refuses a demoted role locally", async () => {
    const storage = new MemoryStorage();
    const other = attempt("55555555-5555-4555-8555-555555555555", { ...scope, actorId: "66666666-6666-4666-8666-666666666666" });
    storeOutboxAttempt(storage, attempt());
    storeOutboxAttempt(storage, other);
    expect(visibleOutbox(readOutbox(storage), scope).map((row) => row.id)).toEqual([ids.request]);

    const send = vi.fn(async () => ({}));
    await flushOutbox(storage, { ...scope, actorId: other.scope.actorId }, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0] as unknown[])[3]).toBe(other.requestId);

    await expect(sendOutboxAttempt(storage, ids.request, { ...scope, role: "sales" }, send)).resolves.toMatchObject({ status: "permission_changed" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(readOutbox(storage)[0]).toMatchObject({ id: ids.request, state: "permission_changed" });
  });

  it("leaves A's queue untouched for B and retries it when A returns", async () => {
    const storage = new MemoryStorage();
    storeOutboxAttempt(storage, attempt());
    const send = vi.fn(async () => ({}));
    const bScope = { ...scope, actorId: "66666666-6666-4666-8666-666666666666" };

    await flushOutbox(storage, bScope, send);
    expect(send).not.toHaveBeenCalled();
    expect(readOutbox(storage)).toHaveLength(1);

    await flushOutbox(storage, scope, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0] as unknown[])[3]).toBe(ids.request);
    expect(readOutbox(storage)).toEqual([]);
  });

  it("uses one local flusher while server idempotency remains authoritative", async () => {
    const storage = new MemoryStorage();
    storeOutboxAttempt(storage, attempt());
    let finish!: () => void;
    const send = vi.fn(() => new Promise<object>((resolve) => { finish = () => resolve({}); }));
    const first = flushOutbox(storage, scope, send);
    const second = flushOutbox(storage, scope, send);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    finish();
    await Promise.all([first, second]);
    expect(readOutbox(storage)).toEqual([]);
  });

  it("requires named discard confirmation and preserves siblings", () => {
    const storage = new MemoryStorage();
    const first = attempt();
    const second = attempt("77777777-7777-4777-8777-777777777777");
    storeOutboxAttempt(storage, first);
    storeOutboxAttempt(storage, second);
    const prompt = outboxDiscardConfirmation([first]);
    expect(prompt).toContain(first.label);
    expect(() => discardOutbox(storage, scope, [first.id], "Discard it")).toThrow(/confirmation/i);
    discardOutbox(storage, scope, [first.id], prompt);
    expect(readOutbox(storage).map((row) => row.id)).toEqual([second.id]);
  });

  it("shares the truthful reading-only outbox view and wires capture before send", () => {
    const screen = SCREENS.find((candidate) => candidate.name === "Offline outbox")!;
    expect(screen.gatedBy).toBeUndefined();
    const markup = renderToStaticMarkup(createElement("div", null, screen.body));
    expect(markup).toContain("Only exact fermentation readings can wait here");
    expect(markup).toContain("Record fermentation reading · FV3");
    expect(markup).not.toMatch(/Record movement ·|Record pick ·|Record cellar transfer ·/);

    const form = readFileSync("app/(app)/cellar/[occupancyId]/reading/reading-form.tsx", "utf8");
    expect(form.indexOf("storeOutboxAttempt(localStorage, next)")).toBeLessThan(form.indexOf("await deliver(next)"));
    const values = { observedAt: "2026-09-10T08:10:00", tempF: "68", gravity: "4.2", ph: "4.1", note: "steady" };
    const editing = renderToStaticMarkup(createElement(FermentationReadingView, { formId: "reading", values, unit: "plato" }));
    const recovery = renderToStaticMarkup(createElement(FermentationReadingActionsView, { formId: "reading", values, recovery: { state: "uncertain", discardLabel: "FV3 reading" } }));
    expect(editing).toContain('type="datetime-local"');
    expect(renderToStaticMarkup(createElement(FermentationReadingActionsView, { formId: "reading", values }))).toContain("Save reading");
    expect(recovery).toContain("Retry exact reading");
    expect(recovery).toContain("Fix as new reading");
    expect(recovery).toContain("Discard FV3 reading");
  });
});
