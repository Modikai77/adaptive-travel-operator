import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createDefaultCheckIn, createDefaultFamilyProfile, createSampleOptions, createSampleStop, nowIso } from "./seed";
import { loadTravelData, replaceTravelData, saveCheckIn } from "./storage";
import type { TravelDataExport } from "./types";

function deleteDb() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("adaptive-travel-operator");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

describe("storage", () => {
  beforeEach(async () => {
    await deleteDb();
  });

  it("round-trips the portable travel export shape", async () => {
    const profile = createDefaultFamilyProfile();
    const stop = createSampleStop();
    const options = createSampleOptions(stop.id);
    const checkIn = createDefaultCheckIn(stop.id);
    const data: TravelDataExport = {
      version: 1,
      exportedAt: nowIso(),
      familyProfile: profile,
      stops: [stop],
      options,
      checkIns: [checkIn],
      recommendationRuns: [],
    };

    await replaceTravelData(data);
    const stored = await loadTravelData();

    expect(stored?.familyProfile.id).toBe("family");
    expect(stored?.stops).toHaveLength(1);
    expect(stored?.options).toHaveLength(3);
  });

  it("persists updated check-ins", async () => {
    const profile = createDefaultFamilyProfile();
    const stop = createSampleStop();
    const checkIn = { ...createDefaultCheckIn(stop.id), energy: 2 };
    await replaceTravelData({
      version: 1,
      exportedAt: nowIso(),
      familyProfile: profile,
      stops: [stop],
      options: [],
      checkIns: [],
      recommendationRuns: [],
    });

    await saveCheckIn(checkIn);
    const stored = await loadTravelData();

    expect(stored?.checkIns[0].energy).toBe(2);
  });
});
