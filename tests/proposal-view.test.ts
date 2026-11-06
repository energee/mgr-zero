// tests/proposal-view.test.ts — what a person sees when approving an agent's change.
import { describe, expect, it } from "vitest";
import { toProposalListRows, toProposalViewProps } from "@/lib/mgr/proposal-view";

const proposal = {
  agentName: "Claude", description: "Add a bin to a location", undo: "Reverse with delete_bin while it is empty.",
  status: "pending", failure: null, rows: [{ field: "name", meaning: "The bin's name.", value: "Cooler A" }],
};

describe("toProposalViewProps", () => {
  it("offers a decision while it is waiting, and says how to undo it", () => {
    const model = toProposalViewProps(proposal);
    expect(model.canDecide).toBe(true);
    expect(model.note).toBeNull();
    expect(model.undo).toBe("Reverse with delete bin while it is empty.");
  });

  it("shows a quantity with its unit, and plain words for true, false and nothing", () => {
    const { rows } = toProposalViewProps({ ...proposal, rows: [
      { field: "qty", value: 12, unit: "bbl" }, { field: "rush", value: true }, { field: "hold", value: false }, { field: "note", value: null },
    ] });
    expect(rows.map(row => row.value)).toEqual(["12 bbl", "Yes", "No", "None"]);
  });

  it("names a nested field by its place in the list", () => {
    expect(toProposalViewProps({ ...proposal, rows: [{ field: "lines[1].qty", value: 2 }] }).rows[0].label).toBe("Lines 2 qty");
  });

  it("names a record field without its id suffix, because the value is the record's name", () => {
    const labels = toProposalViewProps({ ...proposal, rows: [
      { field: "locationId", value: "Main warehouse" }, { field: "lines[0].batch_id", value: "B-12" },
    ] }).rows.map(row => row.label);
    expect(labels).toEqual(["Location", "Lines 1 batch"]);
  });

  it("writes command names in the undo line as words, because a person reads it", () => {
    expect(toProposalViewProps({ ...proposal, undo: "Reverse with delete_bin while the bin has no recorded stock." }).undo)
      .toBe("Reverse with delete bin while the bin has no recorded stock.");
  });

  it("warns before approval when a record could not be named", () => {
    const model = toProposalViewProps({ ...proposal, rows: [{ field: "skuId", value: "Unrecognised record 8f3a", warning: true }] });
    expect(model.canDecide).toBe(true);
    expect(model.note).toEqual({ text: "Some records could not be named. Check them before you approve.", role: "alert" });
  });

  it.each([
    ["expired", "This request has expired. Ask your agent to propose it again."],
    ["declined", "You declined this change."],
    ["committed", "Approved and saved."],
    ["approved", "This change was approved, but its result is unknown. Check the record before trying again."],
  ])("offers no decision once %s", (status, text) => {
    const model = toProposalViewProps({ ...proposal, status });
    expect(model.canDecide).toBe(false);
    expect(model.note?.text).toBe(text);
  });

  it("says why it failed", () => {
    expect(toProposalViewProps({ ...proposal, status: "failed", failure: "That bin exists." }).note)
      .toEqual({ text: "This change was not saved. That bin exists.", role: "alert" });
  });
});

describe("toProposalListRows", () => {
  it("links each waiting change, oldest first as given", () => {
    expect(toProposalListRows([{ id: "a", agentName: "Claude", description: "Add a bin" }])).toEqual([
      { id: "a", title: "Add a bin", detail: "From Claude", href: "/proposals/a" },
    ]);
  });
});
