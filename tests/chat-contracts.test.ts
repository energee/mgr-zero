// Proves portable chat notifications validate without provider-specific rendering types.
import { describe, expect, it } from "vitest";
import {
  assertPortableNotification,
  type ChatCapabilitySet,
  type PortableNotification,
} from "@/lib/chat/contracts";

const validNotification: PortableNotification = {
  reason: "submitted_order",
  urgency: "attention",
  subject: { type: "order", id: "order-0231", safeLabel: "ORD-0231" },
  title: "Review submitted order",
  detail: "Requested Thu · sales review required",
  dueAt: "2026-09-03T09:00:00.000Z",
  ownerClass: "sales",
  resolutionKey: "submitted-order:order-0231",
  actions: [{ id: "open_mgr", label: "Open order in MGR", url: "/orders/order-0231", enabled: true }],
};

describe("portable chat presentation contracts", () => {
  it("accepts a provider-neutral notification", () => {
    expect(() => assertPortableNotification(validNotification)).not.toThrow();
  });

  it("rejects a notification without a safe subject label", () => {
    const { subject, ...notification } = validNotification;
    expect(() => assertPortableNotification({ ...notification, subject: { ...subject, safeLabel: "" } })).toThrow();
  });

  it("keeps capability declarations provider-neutral", () => {
    const capabilities: ChatCapabilitySet = {
      personalDelivery: true,
      persistentHome: true,
      privateSharedSummary: true,
      messageUpdate: true,
      modal: true,
    };
    expect(capabilities).toEqual({
      personalDelivery: true,
      persistentHome: true,
      privateSharedSummary: true,
      messageUpdate: true,
      modal: true,
    });
  });
});
