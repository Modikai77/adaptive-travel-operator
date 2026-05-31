"use client";

import type {
  DailyCheckIn,
  FamilyProfile,
  RecommendationRun,
  TravelDataExport,
  TravelOption,
  TripStop,
} from "./types";

const DB_NAME = "adaptive-travel-operator";
const DB_VERSION = 1;

type StoreName = "family" | "stops" | "options" | "checkIns" | "recommendationRuns";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("family")) db.createObjectStore("family", { keyPath: "id" });
      if (!db.objectStoreNames.contains("stops")) db.createObjectStore("stops", { keyPath: "id" });
      if (!db.objectStoreNames.contains("options")) {
        const store = db.createObjectStore("options", { keyPath: "id" });
        store.createIndex("stopId", "stopId");
      }
      if (!db.objectStoreNames.contains("checkIns")) {
        const store = db.createObjectStore("checkIns", { keyPath: "id" });
        store.createIndex("stopDate", ["stopId", "date"], { unique: true });
      }
      if (!db.objectStoreNames.contains("recommendationRuns")) {
        const store = db.createObjectStore("recommendationRuns", { keyPath: "id" });
        store.createIndex("stopDate", ["stopId", "date"]);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx<T>(storeName: StoreName, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T> | void) {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = action(store);

    transaction.oncomplete = () => {
      db.close();
      resolve(request ? request.result : (undefined as T));
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function getAll<T>(storeName: StoreName): Promise<T[]> {
  return tx<T[]>(storeName, "readonly", (store) => store.getAll());
}

async function put<T>(storeName: StoreName, value: T): Promise<void> {
  await tx(storeName, "readwrite", (store) => {
    store.put(value);
  });
}

async function remove(storeName: StoreName, id: string): Promise<void> {
  await tx(storeName, "readwrite", (store) => {
    store.delete(id);
  });
}

async function clear(storeName: StoreName): Promise<void> {
  await tx(storeName, "readwrite", (store) => {
    store.clear();
  });
}

export async function loadTravelData(): Promise<TravelDataExport | null> {
  if (typeof indexedDB === "undefined") return null;

  const [families, stops, options, checkIns, recommendationRuns] = await Promise.all([
    getAll<FamilyProfile>("family"),
    getAll<TripStop>("stops"),
    getAll<TravelOption>("options"),
    getAll<DailyCheckIn>("checkIns"),
    getAll<RecommendationRun>("recommendationRuns"),
  ]);

  if (!families[0] && stops.length === 0) return null;

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    familyProfile: families[0],
    stops,
    options,
    checkIns,
    recommendationRuns,
  };
}

export async function saveFamilyProfile(profile: FamilyProfile) {
  await put("family", profile);
}

export async function saveStop(stop: TripStop) {
  await put("stops", stop);
}

export async function deleteStop(stopId: string) {
  const [options, checkIns, runs] = await Promise.all([
    getAll<TravelOption>("options"),
    getAll<DailyCheckIn>("checkIns"),
    getAll<RecommendationRun>("recommendationRuns"),
  ]);
  await remove("stops", stopId);
  await Promise.all([
    ...options.filter((option) => option.stopId === stopId).map((option) => remove("options", option.id)),
    ...checkIns.filter((checkIn) => checkIn.stopId === stopId).map((checkIn) => remove("checkIns", checkIn.id)),
    ...runs.filter((run) => run.stopId === stopId).map((run) => remove("recommendationRuns", run.id)),
  ]);
}

export async function saveOption(option: TravelOption) {
  await put("options", option);
}

export async function deleteOption(optionId: string) {
  await remove("options", optionId);
}

export async function saveCheckIn(checkIn: DailyCheckIn) {
  await put("checkIns", checkIn);
}

export async function saveRecommendationRun(run: RecommendationRun) {
  await put("recommendationRuns", run);
}

export async function replaceTravelData(data: TravelDataExport) {
  await Promise.all(["family", "stops", "options", "checkIns", "recommendationRuns"].map((store) => clear(store as StoreName)));
  await saveFamilyProfile(data.familyProfile);
  await Promise.all(data.stops.map(saveStop));
  await Promise.all(data.options.map(saveOption));
  await Promise.all(data.checkIns.map(saveCheckIn));
  await Promise.all(data.recommendationRuns.map(saveRecommendationRun));
}

export function downloadJson(data: TravelDataExport) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `adaptive-travel-operator-${data.exportedAt.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
