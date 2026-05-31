import type { DailyCheckIn, FamilyProfile, TravelOption, TripStop } from "./types";

export function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function nowIso() {
  return new Date().toISOString();
}

export function createDefaultFamilyProfile(): FamilyProfile {
  return {
    id: "family",
    travellers: [
      { id: makeId("traveller"), name: "Parent 1", needs: "Good coffee, practical logistics, memorable food." },
      { id: makeId("traveller"), name: "Parent 2", needs: "Balanced pace, culture, enough downtime." },
      { id: makeId("traveller"), name: "Child", age: 8, needs: "Play time, snacks, shorter bursts of sightseeing." },
    ],
    foodPreferences: "Flexible, family-friendly, avoid long waits when hungry.",
    pace: "balanced",
    constraints: "Prefer not to stack more than one high-effort activity per day.",
    mustAvoid: "Overly long transit days without breaks.",
    updatedAt: nowIso(),
  };
}

export function createSampleStop(): TripStop {
  const now = nowIso();
  return {
    id: makeId("stop"),
    place: "Tokyo",
    country: "Japan",
    startDate: todayIso(),
    endDate: "",
    lodgingNotes: "Base near good transport. Keep evenings flexible.",
    logisticsNotes: "Use public transport, leave extra time for station changes.",
    intentions: "Food, neighbourhood wandering, kid-friendly culture, one standout experience.",
    latitude: 35.6762,
    longitude: 139.6503,
    createdAt: now,
    updatedAt: now,
  };
}

export function createSampleOptions(stopId: string): TravelOption[] {
  const now = nowIso();
  return [
    {
      id: makeId("option"),
      stopId,
      title: "Neighbourhood wander with lunch built in",
      kind: "activity",
      notes: "Pick one area, keep it loose, and anchor the outing around a reliable lunch stop.",
      durationMinutes: 240,
      cost: "medium",
      energy: "medium",
      weatherSensitivity: "mixed",
      kidFit: 8,
      priority: 7,
      rarity: 5,
      logisticsFriction: 3,
      tags: ["food", "wandering", "flexible"],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId("option"),
      stopId,
      title: "Museum or indoor cultural hit",
      kind: "backup",
      notes: "Use as the rain or low-energy anchor. Keep the visit short and leave before everyone fades.",
      durationMinutes: 180,
      cost: "medium",
      energy: "low",
      weatherSensitivity: "indoor",
      kidFit: 7,
      priority: 6,
      rarity: 6,
      logisticsFriction: 2,
      tags: ["rain", "culture", "backup"],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId("option"),
      stopId,
      title: "Recovery morning plus excellent dinner",
      kind: "rest",
      notes: "Protect the day after travel or a heavy outing. Do laundry, nap, then make dinner the win.",
      durationMinutes: 300,
      cost: "low",
      energy: "low",
      weatherSensitivity: "weather-proof",
      kidFit: 9,
      priority: 5,
      rarity: 3,
      logisticsFriction: 1,
      tags: ["recovery", "food", "low effort"],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function createDefaultCheckIn(stopId: string): DailyCheckIn {
  return {
    id: makeId("checkin"),
    stopId,
    date: todayIso(),
    energy: 6,
    hunger: 4,
    mood: 7,
    availableHours: 6,
    weatherTolerance: 6,
    recentFriction: 3,
    notes: "",
    updatedAt: nowIso(),
  };
}
