import type {
  DailyCheckIn,
  FamilyProfile,
  RankedOption,
  SpecificSuggestionsResult,
  TravelOption,
  TripStop,
  WeatherSummary,
} from "./types";

export interface SpecificsContext {
  familyProfile: FamilyProfile;
  stop: TripStop;
  checkIn: DailyCheckIn;
  weather: WeatherSummary;
  rankedOption: RankedOption;
  sourceOption?: TravelOption;
}

export function buildSpecificsPrompt(context: SpecificsContext) {
  return [
    "You are a private travel operator expanding one ranked travel-plan item into concrete choices.",
    "Suggest exactly 3 ranked specific options for the family's current stop.",
    "If the ranked item is already specific, include it if it remains a strong fit, then add close alternatives of the same kind.",
    "If the ranked item is generic, turn it into named places, venues, meals, neighbourhoods, or activity choices in the current stop.",
    "Prefer practical, family-suitable, lower-friction choices. Do not claim live availability, opening hours, tickets, or prices are verified.",
    "Return valid JSON only matching this shape:",
    '{"suggestions":[{"rank":1,"title":"string","category":"string","fit":"string","why":"string","tradeoffs":["string"],"practicalNotes":"string"}],"caveat":"string"}',
    "",
    `Current stop: ${JSON.stringify(context.stop)}`,
    `Family profile: ${JSON.stringify(context.familyProfile)}`,
    `Today check-in: ${JSON.stringify(context.checkIn)}`,
    `Weather: ${JSON.stringify(context.weather)}`,
    `Ranked plan item: ${JSON.stringify(context.rankedOption)}`,
    `Original stored option, if available: ${JSON.stringify(context.sourceOption ?? null)}`,
  ].join("\n");
}

export function fallbackSpecificSuggestions(context: SpecificsContext): SpecificSuggestionsResult {
  const sourceTitle = context.rankedOption.title;
  const place = [context.stop.place, context.stop.country].filter(Boolean).join(", ");
  const kind = context.sourceOption?.kind ?? "activity";

  return {
    sourceOptionId: context.rankedOption.optionId,
    sourceTitle,
    generatedAt: new Date().toISOString(),
    model: "specifics-unavailable",
    caveat: "Add OPENAI_API_KEY to .env.local for named local suggestions. These fallback items keep the decision structure but are not venue-specific.",
    suggestions: [
      {
        rank: 1,
        title: sourceTitle,
        category: kind,
        fit: "Use the existing plan item as the safest baseline.",
        why: `It already ranked well for ${place || "this stop"} against today's context.`,
        tradeoffs: ["It may still need a named venue or booking check."],
        practicalNotes: "Add a more specific backlog item, then rerun specifics for better results.",
      },
      {
        rank: 2,
        title: `${sourceTitle} with the lowest-friction nearby choice`,
        category: kind,
        fit: "Best when energy or timing is fragile.",
        why: "Keeps the intent of the plan while reducing transit and decision load.",
        tradeoffs: ["Requires you to choose the actual nearby place manually."],
        practicalNotes: "Prioritise distance from lodging and a short visit length.",
      },
      {
        rank: 3,
        title: `${sourceTitle} as a shorter backup version`,
        category: "backup",
        fit: "Best if weather, hunger, or mood gets worse.",
        why: "Preserves the day’s purpose without forcing a full outing.",
        tradeoffs: ["Less memorable than a fully researched option."],
        practicalNotes: "Pair it with a reliable meal or rest block.",
      },
    ],
  };
}
