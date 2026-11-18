// tests/material-category-suggestion.test.ts — the material kind question, its confidence gate, and the decide call.
import { Experimental_DecisionRefusalError } from "ai";
import { Experimental_DecisionMockModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { MATERIAL_CATEGORIES } from "@/lib/mgr/enums";
import {
  confidentChoice,
  MATERIAL_CATEGORY_CRITERIA,
  materialCategoryQuestion,
} from "@/lib/mgr/material-category-suggestion";
import { suggestMaterialCategory } from "@/lib/suggest-material-category";

describe("material kind question", () => {
  it("has one criterion per kind, in the enum's order", () => {
    expect(Object.keys(MATERIAL_CATEGORY_CRITERIA)).toEqual([...MATERIAL_CATEGORIES]);
    expect(Object.keys(materialCategoryQuestion().criteria)).toEqual([...MATERIAL_CATEGORIES]);
    expect(materialCategoryQuestion().type).toBe("choice");
  });

  it("reverses the criteria order for the order control", () => {
    expect(Object.keys(materialCategoryQuestion(true).criteria)).toEqual([...MATERIAL_CATEGORIES].reverse());
  });
});

describe("confidentChoice", () => {
  it("returns the choice at exactly the minimum", () => {
    expect(confidentChoice<"hop" | "other">({ choice: "hop", probabilities: { hop: 0.8, other: 0.2 } }, 0.8))
      .toEqual({ choice: "hop", probability: 0.8 });
  });

  it("returns null just below the minimum", () => {
    expect(confidentChoice<"hop" | "other">({ choice: "hop", probabilities: { hop: 0.79, other: 0.21 } }, 0.8)).toBeNull();
  });

  it("returns null without probabilities", () => {
    expect(confidentChoice({ choice: "hop" }, 0.8)).toBeNull();
  });
});

// The provider types, read off the mock so the test needs no direct @ai-sdk/provider dependency.
type DoDecide = NonNullable<Experimental_DecisionMockModelV4["doDecide"]>;
type CallOptions = Parameters<DoDecide>[0];
type Answer = Awaited<ReturnType<DoDecide>>["answers"][string];

function mockModel(answer: Answer, calls: CallOptions[] = []) {
  return new Experimental_DecisionMockModelV4({
    doDecide: async options => {
      calls.push(options);
      return { answers: { category: answer }, warnings: [] };
    },
  });
}

function distribution(choice: string, probability: number): Record<string, number> {
  const rest = (1 - probability) / (MATERIAL_CATEGORIES.length - 1);
  return Object.fromEntries(MATERIAL_CATEGORIES.map(kind => [kind, kind === choice ? probability : rest]));
}

describe("suggestMaterialCategory", () => {
  it("returns a confident choice with its probability", async () => {
    const model = mockModel({ type: "choice", choice: "hop", probabilities: distribution("hop", 0.93) });
    expect(await suggestMaterialCategory("Citra T-90", model)).toEqual({ choice: "hop", probability: 0.93 });
  });

  it("returns null below the threshold", async () => {
    const model = mockModel({ type: "choice", choice: "other", probabilities: distribution("other", 0.5) });
    expect(await suggestMaterialCategory("Mystery item", model)).toBeNull();
  });

  it("sends the name as state and the category question over every kind", async () => {
    const calls: CallOptions[] = [];
    await suggestMaterialCategory("Citra T-90", mockModel({ type: "choice", choice: "hop", probabilities: distribution("hop", 0.93) }, calls));
    expect(calls).toHaveLength(1);
    expect(calls[0].state).toEqual([{ type: "json", value: { materialName: "Citra T-90" } }]);
    const question = calls[0].questions.category;
    expect(question.type === "choice" && Object.keys(question.criteria)).toEqual([...MATERIAL_CATEGORIES]);
  });

  it("rejects when the model refuses", async () => {
    const error = await suggestMaterialCategory("Citra T-90", mockModel({ type: "refusal" })).catch((caught: unknown) => caught);
    expect(Experimental_DecisionRefusalError.isInstance(error)).toBe(true);
  });
});
