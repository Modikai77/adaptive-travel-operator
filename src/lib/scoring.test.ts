import { describe, expect, it } from "vitest";
import { createDefaultCheckIn, createDefaultFamilyProfile, createSampleOptions, createSampleStop } from "./seed";
import { scoreOptions } from "./scoring";
import type { WeatherSummary } from "./types";

const weather: WeatherSummary = {
  status: "available",
  condition: "Rain",
  precipitationProbability: 80,
  temperatureC: 18,
};

describe("scoreOptions", () => {
  it("favours indoor and low-effort options when weather and energy are poor", () => {
    const stop = createSampleStop();
    const profile = createDefaultFamilyProfile();
    const options = createSampleOptions(stop.id);
    const checkIn = {
      ...createDefaultCheckIn(stop.id),
      energy: 3,
      mood: 4,
      recentFriction: 8,
      weatherTolerance: 3,
    };

    const result = scoreOptions({ familyProfile: profile, checkIn, weather, options });

    expect(result.rankedOptions[0].title).toMatch(/Recovery|Museum/);
    expect(result.fallbackPlan).toMatch(/lowest-effort|preserve tomorrow/);
  });

  it("penalizes options that do not fit the time available", () => {
    const stop = createSampleStop();
    const profile = createDefaultFamilyProfile();
    const options = createSampleOptions(stop.id);
    const checkIn = {
      ...createDefaultCheckIn(stop.id),
      availableHours: 2,
    };

    const result = scoreOptions({ familyProfile: profile, checkIn, weather: { status: "unknown" }, options });

    expect(result.rankedOptions.some((option) => option.tradeoffs.join(" ").includes("too long"))).toBe(true);
  });
});
