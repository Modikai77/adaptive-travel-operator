export type PacePreference = "slow" | "balanced" | "ambitious";
export type OptionKind = "activity" | "meal" | "rest" | "backup" | "logistics";
export type CostLevel = "free" | "low" | "medium" | "high";
export type EnergyLevel = "low" | "medium" | "high";
export type WeatherSensitivity = "indoor" | "mixed" | "outdoor" | "weather-proof";

export interface Traveller {
  id: string;
  name: string;
  age?: number;
  needs: string;
}

export interface FamilyProfile {
  id: "family";
  travellers: Traveller[];
  foodPreferences: string;
  pace: PacePreference;
  constraints: string;
  mustAvoid: string;
  updatedAt: string;
}

export interface TripStop {
  id: string;
  place: string;
  country: string;
  startDate: string;
  endDate: string;
  lodgingNotes: string;
  logisticsNotes: string;
  intentions: string;
  latitude?: number;
  longitude?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TravelOption {
  id: string;
  stopId: string;
  title: string;
  kind: OptionKind;
  notes: string;
  durationMinutes: number;
  cost: CostLevel;
  energy: EnergyLevel;
  weatherSensitivity: WeatherSensitivity;
  kidFit: number;
  priority: number;
  rarity: number;
  logisticsFriction: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DailyCheckIn {
  id: string;
  stopId: string;
  date: string;
  energy: number;
  hunger: number;
  mood: number;
  availableHours: number;
  weatherTolerance: number;
  recentFriction: number;
  notes: string;
  updatedAt: string;
}

export interface WeatherSummary {
  status: "available" | "unknown";
  locationName?: string;
  temperatureC?: number;
  precipitationProbability?: number;
  windKph?: number;
  condition?: string;
  source?: string;
  fetchedAt?: string;
  message?: string;
}

export interface RankedOption {
  optionId: string;
  title: string;
  rank: number;
  score: number;
  verdict: string;
  reasons: string[];
  tradeoffs: string[];
}

export interface RejectedOption {
  optionId: string;
  title: string;
  reason: string;
}

export interface RecommendationRun {
  id: string;
  stopId: string;
  date: string;
  generatedAt: string;
  weather: WeatherSummary;
  rankedOptions: RankedOption[];
  avoidToday: RejectedOption[];
  fallbackPlan: string;
  summary: string;
  model: string;
}

export interface SpecificSuggestion {
  rank: number;
  title: string;
  category: string;
  fit: string;
  why: string;
  tradeoffs: string[];
  practicalNotes: string;
}

export interface SpecificSuggestionsResult {
  sourceOptionId: string;
  sourceTitle: string;
  generatedAt: string;
  model: string;
  suggestions: SpecificSuggestion[];
  caveat: string;
}

export interface TravelDataExport {
  version: 1;
  exportedAt: string;
  familyProfile: FamilyProfile;
  stops: TripStop[];
  options: TravelOption[];
  checkIns: DailyCheckIn[];
  recommendationRuns: RecommendationRun[];
}
