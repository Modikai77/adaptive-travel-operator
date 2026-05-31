import type { DailyCheckIn, FamilyProfile, TravelOption, TripStop, WeatherSummary } from "./types";

export interface RecommendationContext {
  familyProfile: FamilyProfile;
  stop: TripStop;
  checkIn: DailyCheckIn;
  weather: WeatherSummary;
  options: TravelOption[];
}

export function buildRecommendationPrompt(context: RecommendationContext) {
  return [
    "You are a private travel operator for a family on a long world trip.",
    "Rank today's options. Be decisive, practical, and sensitive to fatigue, hunger, weather, logistics, kid fit, rarity, and the wider trip.",
    "Return valid JSON only matching this shape:",
    '{"summary":"string","rankedOptions":[{"optionId":"string","title":"string","rank":1,"score":80,"verdict":"string","reasons":["string"],"tradeoffs":["string"]}],"avoidToday":[{"optionId":"string","title":"string","reason":"string"}],"fallbackPlan":"string"}',
    "",
    `Family: ${JSON.stringify(context.familyProfile)}`,
    `Current stop: ${JSON.stringify(context.stop)}`,
    `Today check-in: ${JSON.stringify(context.checkIn)}`,
    `Weather: ${JSON.stringify(context.weather)}`,
    `Options: ${JSON.stringify(context.options)}`,
  ].join("\n");
}
