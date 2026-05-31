import type {
  DailyCheckIn,
  FamilyProfile,
  RankedOption,
  RejectedOption,
  TravelOption,
  WeatherSummary,
} from "./types";

const energyNeed = {
  low: 2,
  medium: 5,
  high: 8,
};

export interface ScoreInput {
  familyProfile: FamilyProfile;
  checkIn: DailyCheckIn;
  weather: WeatherSummary;
  options: TravelOption[];
}

export interface ScoreOutput {
  rankedOptions: RankedOption[];
  avoidToday: RejectedOption[];
  fallbackPlan: string;
  summary: string;
}

export function scoreOptions({ familyProfile, checkIn, weather, options }: ScoreInput): ScoreOutput {
  const scored = options.map((option) => {
    const reasons: string[] = [];
    const tradeoffs: string[] = [];
    let score = 42;

    const priorityScore = option.priority * 3;
    score += priorityScore;
    if (option.priority >= 8) reasons.push("High-priority experience worth protecting.");

    const rarityScore = option.rarity * 2;
    score += rarityScore;
    if (option.rarity >= 8) reasons.push("Harder to replicate later in the trip.");

    const kidScore = (option.kidFit - 5) * 3;
    score += kidScore;
    if (option.kidFit >= 8) reasons.push("Strong fit for the family energy and child needs.");
    if (option.kidFit <= 4) tradeoffs.push("Kid fit looks weak for today.");

    const availableMinutes = checkIn.availableHours * 60;
    if (option.durationMinutes <= availableMinutes) {
      score += 8;
      reasons.push("Fits inside the available time window.");
    } else {
      score -= 18;
      tradeoffs.push("Likely too long for the time available.");
    }

    const energyGap = energyNeed[option.energy] - checkIn.energy;
    if (energyGap <= 0) {
      score += option.energy === "low" && checkIn.energy <= 5 ? 10 : 4;
      if (option.energy === "low" && checkIn.energy <= 5) reasons.push("Low-effort choice protects recovery.");
    } else {
      score -= energyGap * 6;
      tradeoffs.push("Requires more energy than the family seems to have.");
    }

    if (checkIn.hunger >= 7 && option.kind === "meal") {
      score += 15;
      reasons.push("Food should be handled early.");
    }

    if (checkIn.hunger >= 7 && option.kind !== "meal" && !option.tags.some((tag) => tag.includes("food"))) {
      score -= 8;
      tradeoffs.push("Hunger is elevated and this does not solve food.");
    }

    if (checkIn.mood <= 4 && option.energy === "high") {
      score -= 12;
      tradeoffs.push("Mood is low, so a demanding plan is fragile.");
    }

    if (checkIn.recentFriction >= 7) {
      score -= option.logisticsFriction * 4;
      if (option.logisticsFriction >= 6) tradeoffs.push("Recent friction makes the logistics risk feel too high.");
    } else {
      score -= option.logisticsFriction * 2;
    }

    const precipitation = weather.precipitationProbability ?? 0;
    if (weather.status === "available" && precipitation >= 55) {
      if (option.weatherSensitivity === "indoor" || option.weatherSensitivity === "weather-proof") {
        score += 14;
        reasons.push("Works well in wet weather.");
      }
      if (option.weatherSensitivity === "outdoor") {
        score -= checkIn.weatherTolerance <= 5 ? 24 : 14;
        tradeoffs.push("Weather makes this exposed plan risky.");
      }
    }

    if (familyProfile.pace === "slow" && option.energy === "high") score -= 8;
    if (familyProfile.pace === "ambitious" && option.priority >= 7) score += 5;

    if (option.kind === "rest" && (checkIn.energy <= 4 || checkIn.recentFriction >= 6)) {
      score += 18;
      reasons.push("Recovery is likely the best way to preserve the wider trip.");
    }

    if (reasons.length === 0) reasons.push("Balanced against today’s context better than most alternatives.");

    return {
      option,
      score: Math.max(0, Math.min(100, Math.round(score))),
      reasons: reasons.slice(0, 3),
      tradeoffs: tradeoffs.slice(0, 2),
    };
  });

  const sorted = scored.sort((a, b) => b.score - a.score);
  const rankedOptions = sorted.slice(0, 4).map((item, index) => ({
    optionId: item.option.id,
    title: item.option.title,
    rank: index + 1,
    score: item.score,
    verdict: verdictForScore(item.score, index),
    reasons: item.reasons,
    tradeoffs: item.tradeoffs,
  }));

  const avoidToday = sorted
    .filter((item) => item.score < 45 || item.tradeoffs.length >= 2)
    .slice(0, 3)
    .map((item) => ({
      optionId: item.option.id,
      title: item.option.title,
      reason: item.tradeoffs[0] ?? "Lower fit for today’s constraints.",
    }));

  const top = rankedOptions[0];
  const fallbackPlan =
    checkIn.energy <= 4 || checkIn.recentFriction >= 7
      ? "If the day starts to wobble, switch to the lowest-effort food or rest option and preserve tomorrow."
      : "If weather or timing slips, choose the shortest indoor or weather-proof option and keep one good meal as the anchor.";

  return {
    rankedOptions,
    avoidToday,
    fallbackPlan,
    summary: top
      ? `${top.title} is the strongest fit right now because it balances priority, energy, weather, and logistics.`
      : "Add a few options for this stop, then run the daily operator again.",
  };
}

function verdictForScore(score: number, index: number) {
  if (index === 0 && score >= 72) return "Best move today";
  if (score >= 70) return "Strong fit";
  if (score >= 55) return "Viable with care";
  return "Only if circumstances change";
}
