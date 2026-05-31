import { describe, expect, it } from "vitest";
import { recommendationPayloadSchema, specificSuggestionsPayloadSchema } from "./schemas";

describe("recommendationPayloadSchema", () => {
  it("accepts valid structured recommendation output", () => {
    const parsed = recommendationPayloadSchema.parse({
      summary: "Start with the indoor museum.",
      rankedOptions: [
        {
          optionId: "option_1",
          title: "Museum",
          rank: 1,
          score: 82,
          verdict: "Best move today",
          reasons: ["Rain safe"],
          tradeoffs: [],
        },
      ],
      fallbackPlan: "Switch to a rest block if energy drops.",
    });

    expect(parsed.avoidToday).toEqual([]);
    expect(parsed.rankedOptions[0].score).toBe(82);
  });

  it("rejects scores outside the expected range", () => {
    expect(() =>
      recommendationPayloadSchema.parse({
        summary: "Bad shape",
        rankedOptions: [
          {
            optionId: "option_1",
            title: "Museum",
            rank: 1,
            score: 160,
            verdict: "Impossible",
            reasons: [],
            tradeoffs: [],
          },
        ],
        avoidToday: [],
        fallbackPlan: "Rest.",
      }),
    ).toThrow();
  });

  it("requires exactly three specific suggestions", () => {
    const parsed = specificSuggestionsPayloadSchema.parse({
      suggestions: [1, 2, 3].map((rank) => ({
        rank,
        title: `Specific option ${rank}`,
        category: "museum",
        fit: "Good family fit.",
        why: "It fits the current plan item.",
        tradeoffs: [],
        practicalNotes: "Check opening hours before leaving.",
      })),
      caveat: "Not live verified.",
    });

    expect(parsed.suggestions).toHaveLength(3);
  });
});
