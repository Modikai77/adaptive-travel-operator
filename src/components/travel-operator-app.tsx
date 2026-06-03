"use client";

import {
  Activity,
  Archive,
  CalendarDays,
  Check,
  CloudSun,
  Download,
  Gauge,
  LogOut,
  MapPin,
  Plus,
  RefreshCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  createDefaultCheckIn,
  createDefaultFamilyProfile,
  makeId,
  nowIso,
  todayIso,
} from "@/lib/seed";
import { mergeImportedItinerary, parseItineraryCsv } from "@/lib/itinerary-import";
import { downloadJson } from "@/lib/storage";
import type {
  CostLevel,
  DailyCheckIn,
  EnergyLevel,
  FamilyProfile,
  OptionKind,
  PacePreference,
  RankedOption,
  RecommendationRun,
  SpecificSuggestionsResult,
  TravelDataExport,
  TravelOption,
  TripStop,
  WeatherSensitivity,
  WeatherSummary,
} from "@/lib/types";

type TabId = "today" | "trip" | "profile" | "data";

const tabs: Array<{ id: TabId; label: string; icon: typeof Gauge }> = [
  { id: "today", label: "Today", icon: Gauge },
  { id: "trip", label: "Trip", icon: MapPin },
  { id: "profile", label: "Family", icon: Users },
  { id: "data", label: "Data", icon: Archive },
];

const emptyWeather: WeatherSummary = {
  status: "unknown",
  message: "Weather has not been fetched yet.",
};

interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

interface TripSummary {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export function TravelOperatorApp() {
  const [loaded, setLoaded] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [activeTripId, setActiveTripId] = useState("");
  const [hydratedTripId, setHydratedTripId] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("today");
  const [familyProfile, setFamilyProfile] = useState<FamilyProfile>(() => createDefaultFamilyProfile());
  const [stops, setStops] = useState<TripStop[]>([]);
  const [options, setOptions] = useState<TravelOption[]>([]);
  const [checkIns, setCheckIns] = useState<DailyCheckIn[]>([]);
  const [recommendationRuns, setRecommendationRuns] = useState<RecommendationRun[]>([]);
  const [activeStopId, setActiveStopId] = useState("");
  const [weather, setWeather] = useState<WeatherSummary>(emptyWeather);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      const auth = await fetchJson<{ user: AuthUser | null; error?: string }>("/api/auth/me");
      if (!alive) return;

      if (!auth.user) {
        setUser(null);
        setLoaded(true);
        return;
      }

      setUser(auth.user);
      await loadTripsAndData();
      setLoaded(true);
    }

    load().catch(() => {
      setStatus("Could not connect to cloud storage. Check DATABASE_URL and refresh.");
      setLoaded(true);
    });

    return () => {
      alive = false;
    };
  }, []);

  async function loadTripsAndData(preferredTripId?: string) {
    setHydratedTripId("");
    let tripList = (await fetchJson<{ trips: TripSummary[] }>("/api/trips")).trips;

    if (tripList.length === 0) {
      const created = await fetchJson<{ trip: Pick<TripSummary, "id" | "name"> }>("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "World Trip 2026-27" }),
      });
      tripList = (await fetchJson<{ trips: TripSummary[] }>("/api/trips")).trips;
      preferredTripId = created.trip.id;
    }

    setTrips(tripList);
    const nextTripId = preferredTripId ?? activeTripId ?? tripList[0]?.id ?? "";
    setActiveTripId(nextTripId);
    applyTravelData(makeBlankTravelData());

    if (!nextTripId) return;

    const response = await fetchJson<{ data: TravelDataExport | null }>(`/api/travel-data?tripId=${encodeURIComponent(nextTripId)}`);

    if (response.data) {
      applyTravelData(response.data);
      setHydratedTripId(nextTripId);
      return;
    }

    const seedData = makeBlankTravelData();

    await saveCloudTravelData(nextTripId, seedData);
    applyTravelData(seedData);
    setHydratedTripId(nextTripId);
  }

  function applyTravelData(data: TravelDataExport) {
    setFamilyProfile(data.familyProfile);
    setStops(data.stops);
    setOptions(data.options);
    setCheckIns(data.checkIns);
    setRecommendationRuns(data.recommendationRuns);
    setActiveStopId(pickCurrentStop(data.stops)?.id ?? data.stops[0]?.id ?? "");
  }

  const activeStop = useMemo(
    () => stops.find((stop) => stop.id === activeStopId) ?? pickCurrentStop(stops) ?? stops[0],
    [activeStopId, stops],
  );

  const today = todayIso();
  const currentOptions = useMemo(
    () => options.filter((option) => option.stopId === activeStop?.id),
    [activeStop?.id, options],
  );
  const currentCheckIn = useMemo(() => {
    if (!activeStop) return null;
    return (
      checkIns.find((checkIn) => checkIn.stopId === activeStop.id && checkIn.date === today) ??
      createDefaultCheckIn(activeStop.id)
    );
  }, [activeStop, checkIns, today]);
  const latestRun = useMemo(
    () =>
      recommendationRuns
        .filter((run) => run.stopId === activeStop?.id && run.date === today)
        .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0],
    [activeStop?.id, recommendationRuns, today],
  );

  useEffect(() => {
    if (!loaded || !user || !activeStop || !currentCheckIn || activeTripId !== hydratedTripId) return;
    if (checkIns.some((checkIn) => checkIn.id === currentCheckIn.id)) return;
    const nextCheckIns = [...checkIns, currentCheckIn];
    setCheckIns(nextCheckIns);
    persistTravelData({ checkIns: nextCheckIns }).catch(() => setStatus("Could not save today's check-in."));
  }, [activeStop, activeTripId, checkIns, currentCheckIn, hydratedTripId, loaded, user]);

  useEffect(() => {
    if (!activeStop) return;
    fetchWeather(activeStop);
  }, [activeStop?.id]);

  async function fetchWeather(stop: TripStop) {
    setWeatherLoading(true);
    try {
      const params = new URLSearchParams({
        place: stop.place,
        country: stop.country,
      });
      if (stop.latitude && stop.longitude) {
        params.set("lat", String(stop.latitude));
        params.set("lon", String(stop.longitude));
      }
      const response = await fetch(`/api/weather?${params.toString()}`);
      setWeather((await response.json()) as WeatherSummary);
    } catch {
      setWeather({
        status: "unknown",
        message: "Weather is unavailable right now. Manual context will still be used.",
      });
    } finally {
      setWeatherLoading(false);
    }
  }

  async function updateCheckIn(patch: Partial<DailyCheckIn>) {
    if (!currentCheckIn) return;
    const next = { ...currentCheckIn, ...patch, updatedAt: nowIso() };
    const nextCheckIns = upsert(checkIns, next);
    setCheckIns(nextCheckIns);
    await persistTravelData({ checkIns: nextCheckIns });
  }

  async function runOperator() {
    if (!activeStop || !currentCheckIn) return;
    setRecommendationLoading(true);
    setStatus("");
    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyProfile,
          stop: activeStop,
          checkIn: currentCheckIn,
          weather,
          options: currentOptions,
        }),
      });
      const payload = await response.json();
      const run: RecommendationRun = {
        id: makeId("run"),
        stopId: activeStop.id,
        date: today,
        generatedAt: nowIso(),
        weather,
        rankedOptions: payload.rankedOptions ?? [],
        avoidToday: payload.avoidToday ?? [],
        fallbackPlan: payload.fallbackPlan ?? "Keep the day smaller and protect the next good window.",
        summary: payload.summary ?? "The operator produced a ranked plan.",
        model: payload.model ?? "unknown",
      };
      const nextRuns = [run, ...recommendationRuns];
      setRecommendationRuns(nextRuns);
      await persistTravelData({ recommendationRuns: nextRuns });
      setStatus("Daily operator updated.");
    } catch {
      setStatus("Recommendation failed. Try again, or use the saved fallback options.");
    } finally {
      setRecommendationLoading(false);
    }
  }

  async function handleExport() {
    const data: TravelDataExport = {
      version: 1,
      exportedAt: nowIso(),
      familyProfile,
      stops,
      options,
      checkIns,
      recommendationRuns,
    };
    downloadJson(data);
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as TravelDataExport;
      if (data.version !== 1 || !data.familyProfile || !Array.isArray(data.stops)) {
        throw new Error("Unsupported backup");
      }
      setFamilyProfile(data.familyProfile);
      setStops(data.stops);
      setOptions(data.options);
      setCheckIns(data.checkIns);
      setRecommendationRuns(data.recommendationRuns);
      setActiveStopId(data.stops[0]?.id ?? "");
      if (!activeTripId) throw new Error("No active trip selected");
      await saveCloudTravelData(activeTripId, data);
      setStatus("Backup imported.");
    } catch {
      setStatus("Import failed. Check this is an Adaptive Travel Operator JSON backup.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleItineraryImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = parseItineraryCsv(text);
      if (imported.stops.length === 0) {
        setStatus(
          `Itinerary import found no stops. Detected headers: ${
            imported.detectedHeaders.length ? imported.detectedHeaders.join(", ") : "none"
          }. Include a City, Place, Stop, Destination, Location, Base, or Where column.`,
        );
        return;
      }

      const merged = mergeImportedItinerary({
        existingStops: stops,
        existingOptions: options,
        imported,
      });

      const newOptions = merged.options.filter(
        (option) => !options.some((existing) => existing.id === option.id),
      );

      setStops(merged.stops);
      setOptions(merged.options);
      setActiveStopId(findMergedStopId(merged.stops, imported.stops[0]) ?? merged.stops[0]?.id ?? "");

      await persistTravelData({ stops: merged.stops, options: merged.options });

      setStatus(
        `Itinerary imported: ${imported.stops.length} stops and ${newOptions.length} new options from ${imported.totalRows} rows. ${
          imported.skippedRows ? `${imported.skippedRows} rows skipped.` : ""
        }`,
      );
    } catch {
      setStatus("Itinerary import failed. Export your Google Sheet as CSV with a place/city column and try again.");
    } finally {
      event.target.value = "";
    }
  }

  async function persistTravelData(patch: Partial<TravelDataExport>) {
    if (!activeTripId) throw new Error("No active trip selected");
    if (activeTripId !== hydratedTripId) throw new Error("Trip data is still loading");
    await saveCloudTravelData(
      activeTripId,
      makeTravelData({
        familyProfile: patch.familyProfile ?? familyProfile,
        stops: patch.stops ?? stops,
        options: patch.options ?? options,
        checkIns: patch.checkIns ?? checkIns,
        recommendationRuns: patch.recommendationRuns ?? recommendationRuns,
      }),
    );
  }

  async function createNewTrip(name: string) {
    const created = await fetchJson<{ trip: Pick<TripSummary, "id" | "name"> }>("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await loadTripsAndData(created.trip.id);
    setStatus(`Created trip: ${created.trip.name}.`);
  }

  async function switchTrip(tripId: string) {
    setActiveTripId(tripId);
    await loadTripsAndData(tripId);
  }

  async function inviteToActiveTrip(email: string, role: "editor" | "viewer") {
    if (!activeTripId) return;
    await fetchJson<{ ok: true }>("/api/trips/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripId: activeTripId, email, role }),
    });
    setStatus(`Invitation saved for ${email}. They can sign in with that email to access this trip.`);
  }

  if (!loaded) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-5">
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-6 shadow-sm">
          <p className="text-sm font-semibold text-[var(--accent)]">Loading your private operator</p>
          <p className="mt-2 text-sm text-[var(--muted)]">Opening your cloud trip storage.</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        status={status}
          onSignedIn={async (nextUser) => {
            setUser(nextUser);
            setStatus("");
            await loadTripsAndData();
          }}
      />
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 pb-28 pt-4 sm:px-6 lg:px-8">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Adaptive Travel Operator</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-semibold leading-tight text-[var(--foreground)] sm:text-4xl">
            What should we do today?
          </h1>
        </div>
        {activeTripId ? (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Signed in as {user.email} · {trips.find((trip) => trip.id === activeTripId)?.name ?? "Trip"}
          </p>
        ) : null}
        <button
          className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[var(--foreground)]"
          onClick={() => activeStop && fetchWeather(activeStop)}
          aria-label="Refresh weather"
          title="Refresh weather"
        >
          <RefreshCcw size={18} />
        </button>
        <button
          className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[var(--foreground)]"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            setUser(null);
            setStatus("Signed out.");
          }}
          aria-label="Sign out"
          title={`Sign out ${user.email}`}
        >
          <LogOut size={18} />
        </button>
      </header>

      {status ? (
        <div className="mb-4 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm text-[var(--ink-soft)]">
          {status}
        </div>
      ) : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <Metric icon={MapPin} label="Current stop" value={activeStop ? `${activeStop.place}, ${activeStop.country}` : "Add a stop"} />
        <Metric icon={Activity} label="Backlog options" value={`${currentOptions.length} ready`} />
        <Metric icon={CloudSun} label="Weather" value={weatherLabel(weather, weatherLoading)} />
      </section>

      <div className="mb-4 hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1 sm:grid sm:grid-cols-4">
        {tabs.map((tab) => (
          <TabButton key={tab.id} tab={tab} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} />
        ))}
      </div>

      {activeTab === "today" && !activeStop ? (
        <section className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel)] p-6 text-sm text-[var(--muted)]">
          <p className="text-base font-semibold text-[var(--foreground)]">This trip is blank.</p>
          <p className="mt-2 leading-6">Add your first stop in the Trip tab, or import your itinerary CSV from Data.</p>
        </section>
      ) : null}
      {activeTab === "today" && activeStop && currentCheckIn ? (
        <TodayScreen
          familyProfile={familyProfile}
          stop={activeStop}
          weather={weather}
          checkIn={currentCheckIn}
          latestRun={latestRun}
          options={currentOptions}
          loading={recommendationLoading}
          onCheckInChange={updateCheckIn}
          onRun={runOperator}
        />
      ) : null}
      {activeTab === "trip" ? (
        <TripScreen
          stops={stops}
          activeStopId={activeStop?.id ?? ""}
          options={options}
          onSelectStop={setActiveStopId}
          onSaveStop={async (stop) => {
            const nextStops = upsert(stops, stop);
            setStops(nextStops);
            setActiveStopId(stop.id);
            await persistTravelData({ stops: nextStops });
          }}
          onDeleteStop={async (stopId) => {
            const nextStops = stops.filter((stop) => stop.id !== stopId);
            const nextOptions = options.filter((option) => option.stopId !== stopId);
            setStops(nextStops);
            setOptions(nextOptions);
            if (activeStopId === stopId) setActiveStopId(nextStops[0]?.id ?? "");
            await persistTravelData({ stops: nextStops, options: nextOptions });
          }}
          onSaveOption={async (option) => {
            const nextOptions = upsert(options, option);
            setOptions(nextOptions);
            await persistTravelData({ options: nextOptions });
          }}
          onDeleteOption={async (optionId) => {
            const nextOptions = options.filter((option) => option.id !== optionId);
            setOptions(nextOptions);
            await persistTravelData({ options: nextOptions });
          }}
        />
      ) : null}
      {activeTab === "profile" ? (
        <ProfileScreen
          profile={familyProfile}
          onSave={async (profile) => {
            setFamilyProfile(profile);
            await persistTravelData({ familyProfile: profile });
            setStatus("Family profile saved.");
          }}
        />
      ) : null}
      {activeTab === "data" ? (
        <DataScreen
          runs={recommendationRuns}
          trips={trips}
          activeTripId={activeTripId}
          onExport={handleExport}
          onImport={handleImport}
          onItineraryImport={handleItineraryImport}
          onSwitchTrip={switchTrip}
          onCreateTrip={createNewTrip}
          onInvite={inviteToActiveTrip}
        />
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 border-t border-[var(--line)] bg-[var(--panel)]/95 px-3 py-2 backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
          {tabs.map((tab) => (
            <TabButton key={tab.id} tab={tab} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} compact />
          ))}
        </div>
      </nav>
    </main>
  );
}

function AuthScreen({
  status,
  onSignedIn,
}: {
  status: string;
  onSignedIn: (user: AuthUser) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");

    try {
      const response = await fetchJson<{ user: AuthUser; error?: string }>(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      await onSignedIn(response.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-8">
      <section className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Adaptive Travel Operator</p>
        <h1 className="mt-2 text-3xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Your trip now syncs through Neon/Postgres, so the same account works across devices.
        </p>

        {status ? <p className="mt-4 rounded-lg border border-[var(--line)] bg-white p-3 text-sm text-[var(--ink-soft)]">{status}</p> : null}
        {error ? <p className="mt-4 rounded-lg border border-[rgba(163,59,43,0.25)] bg-[rgba(163,59,43,0.06)] p-3 text-sm text-[var(--danger)]">{error}</p> : null}

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg border border-[var(--line)] bg-white p-1">
          <button
            className={`focus-ring h-10 rounded-md text-sm font-semibold ${mode === "login" ? "bg-[var(--foreground)] text-white" : "text-[var(--muted)]"}`}
            onClick={() => setMode("login")}
          >
            Log in
          </button>
          <button
            className={`focus-ring h-10 rounded-md text-sm font-semibold ${mode === "signup" ? "bg-[var(--foreground)] text-white" : "text-[var(--muted)]"}`}
            onClick={() => setMode("signup")}
          >
            Sign up
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          <TextField label="Email" type="email" value={email} onChange={setEmail} />
          <TextField label="Password" type="password" value={password} onChange={setPassword} />
        </div>

        <button
          className="focus-ring mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          onClick={submit}
          disabled={busy || !email || password.length < 8}
        >
          {busy ? <RefreshCcw size={18} className="animate-spin" /> : <Users size={18} />}
          {mode === "login" ? "Log in" : "Create account"}
        </button>

        <a
          className="focus-ring mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-white px-4 font-semibold text-[var(--foreground)]"
          href="/api/auth/google/start"
        >
          <Users size={18} />
          Sign in with Google
        </a>

      </section>
    </main>
  );
}

function TodayScreen({
  familyProfile,
  stop,
  weather,
  checkIn,
  latestRun,
  options,
  loading,
  onCheckInChange,
  onRun,
}: {
  familyProfile: FamilyProfile;
  stop: TripStop;
  weather: WeatherSummary;
  checkIn: DailyCheckIn;
  latestRun?: RecommendationRun;
  options: TravelOption[];
  loading: boolean;
  onCheckInChange: (patch: Partial<DailyCheckIn>) => Promise<void>;
  onRun: () => Promise<void>;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--accent)]">{stop.place}</p>
            <h2 className="text-xl font-semibold">Morning context</h2>
          </div>
          <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent-strong)]">
            {checkIn.date}
          </span>
        </div>
        <div className="mt-5 grid gap-4">
          <Slider label="Energy" value={checkIn.energy} lowLabel="Wiped" highLabel="Ready" onChange={(energy) => onCheckInChange({ energy })} />
          <Slider label="Hunger" value={checkIn.hunger} lowLabel="Fine" highLabel="Urgent" onChange={(hunger) => onCheckInChange({ hunger })} />
          <Slider label="Mood" value={checkIn.mood} lowLabel="Fragile" highLabel="Buoyant" onChange={(mood) => onCheckInChange({ mood })} />
          <Slider
            label="Weather tolerance"
            value={checkIn.weatherTolerance}
            lowLabel="Keep dry"
            highLabel="Can cope"
            onChange={(weatherTolerance) => onCheckInChange({ weatherTolerance })}
          />
          <Slider
            label="Recent friction"
            value={checkIn.recentFriction}
            lowLabel="Smooth"
            highLabel="Messy"
            onChange={(recentFriction) => onCheckInChange({ recentFriction })}
          />
          <label className="grid gap-2">
            <span className="text-sm font-medium">Available hours</span>
            <input
              className="focus-ring h-11 rounded-lg border border-[var(--line)] bg-white px-3"
              type="number"
              min="1"
              max="14"
              value={checkIn.availableHours}
              onChange={(event) => onCheckInChange({ availableHours: Number(event.target.value) })}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Recent notes</span>
            <textarea
              className="focus-ring min-h-24 resize-y rounded-lg border border-[var(--line)] bg-white px-3 py-2"
              value={checkIn.notes}
              placeholder="Delayed arrival, bad sleep, brilliant lunch yesterday..."
              onChange={(event) => onCheckInChange({ notes: event.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="grid gap-4">
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[var(--accent)]">Live context</p>
              <h2 className="text-xl font-semibold">Weather and options</h2>
            </div>
            <CloudSun size={22} className="text-[var(--accent)]" />
          </div>
          <div className="mt-4 grid gap-3 text-sm text-[var(--ink-soft)] sm:grid-cols-2">
            <p>
              <span className="font-semibold text-[var(--foreground)]">Weather:</span> {weatherDetail(weather)}
            </p>
            <p>
              <span className="font-semibold text-[var(--foreground)]">Option pool:</span> {options.length} items for this stop.
            </p>
          </div>
          <button
            className="focus-ring mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onRun}
            disabled={loading || options.length === 0}
          >
            {loading ? <RefreshCcw size={18} className="animate-spin" /> : <SlidersHorizontal size={18} />}
            {loading ? "Ranking today" : "Rank today's options"}
          </button>
        </div>

        {latestRun ? (
          <RecommendationView
            run={latestRun}
            familyProfile={familyProfile}
            stop={stop}
            checkIn={checkIn}
            options={options}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel)] p-5 text-sm text-[var(--muted)]">
            Run the operator after your check-in to get ranked choices, avoid-today warnings, and a fallback plan.
          </div>
        )}
      </section>
    </div>
  );
}

function RecommendationView({
  run,
  familyProfile,
  stop,
  checkIn,
  options,
}: {
  run: RecommendationRun;
  familyProfile: FamilyProfile;
  stop: TripStop;
  checkIn: DailyCheckIn;
  options: TravelOption[];
}) {
  const [specificsByOptionId, setSpecificsByOptionId] = useState<Record<string, SpecificSuggestionsResult>>({});
  const [loadingOptionId, setLoadingOptionId] = useState("");
  const [errorByOptionId, setErrorByOptionId] = useState<Record<string, string>>({});

  async function suggestSpecifics(item: RankedOption) {
    setLoadingOptionId(item.optionId);
    setErrorByOptionId((items) => ({ ...items, [item.optionId]: "" }));

    try {
      const response = await fetch("/api/suggest-specifics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyProfile,
          stop,
          checkIn,
          weather: run.weather,
          rankedOption: item,
          sourceOption: options.find((option) => option.id === item.optionId),
        }),
      });
      const payload = (await response.json()) as SpecificSuggestionsResult;
      setSpecificsByOptionId((items) => ({ ...items, [item.optionId]: payload }));
    } catch {
      setErrorByOptionId((items) => ({
        ...items,
        [item.optionId]: "Could not suggest specifics. Check the API key and try again.",
      }));
    } finally {
      setLoadingOptionId("");
    }
  }

  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">{run.model}</p>
          <h2 className="mt-1 text-xl font-semibold">Ranked plan</h2>
        </div>
        <span className="font-mono text-xs text-[var(--muted)]">{new Date(run.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">{run.summary}</p>
      <div className="mt-4 grid gap-3">
        {run.rankedOptions.map((item) => (
          <article key={item.optionId} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[var(--accent)]">#{item.rank} · {item.verdict}</p>
                <h3 className="mt-1 text-lg font-semibold">{item.title}</h3>
              </div>
              <span className="rounded-full bg-[var(--foreground)] px-3 py-1 font-mono text-xs text-white">{item.score}</span>
            </div>
            <ul className="mt-3 grid gap-2 text-sm text-[var(--ink-soft)]">
              {item.reasons.map((reason) => (
                <li key={reason} className="flex gap-2">
                  <Check size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
            {item.tradeoffs.length ? (
              <p className="mt-3 text-sm text-[var(--warning)]">Watch: {item.tradeoffs.join(" ")}</p>
            ) : null}
            <button
              className="focus-ring mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 text-sm font-semibold text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => suggestSpecifics(item)}
              disabled={loadingOptionId === item.optionId}
            >
              {loadingOptionId === item.optionId ? <RefreshCcw size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {loadingOptionId === item.optionId ? "Suggesting" : "Suggest specifics"}
            </button>
            {errorByOptionId[item.optionId] ? (
              <p className="mt-3 text-sm text-[var(--danger)]">{errorByOptionId[item.optionId]}</p>
            ) : null}
            {specificsByOptionId[item.optionId] ? (
              <SpecificSuggestionsView result={specificsByOptionId[item.optionId]} />
            ) : null}
          </article>
        ))}
      </div>
      {run.avoidToday.length ? (
        <div className="mt-4 rounded-lg border border-[rgba(163,59,43,0.25)] bg-[rgba(163,59,43,0.06)] p-4">
          <h3 className="text-sm font-semibold text-[var(--danger)]">Avoid today</h3>
          <ul className="mt-2 grid gap-2 text-sm text-[var(--ink-soft)]">
            {run.avoidToday.map((item) => (
              <li key={item.optionId}>{item.title}: {item.reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--accent-soft)] p-4 text-sm text-[var(--accent-strong)]">
        <span className="font-semibold">Fallback:</span> {run.fallbackPlan}
      </div>
    </section>
  );
}

function SpecificSuggestionsView({ result }: { result: SpecificSuggestionsResult }) {
  return (
    <div className="mt-4 rounded-lg border border-[var(--line)] bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Specifics</p>
          <h4 className="mt-1 font-semibold">Three concrete choices</h4>
        </div>
        <span className="font-mono text-[10px] text-[var(--muted)]">{result.model}</span>
      </div>
      <div className="mt-3 grid gap-3">
        {result.suggestions.map((suggestion) => (
          <article key={`${result.sourceOptionId}-${suggestion.rank}`} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--foreground)] font-mono text-xs text-white">
                {suggestion.rank}
              </span>
              <div>
                <p className="text-xs font-semibold text-[var(--accent)]">{suggestion.category}</p>
                <h5 className="mt-0.5 font-semibold">{suggestion.title}</h5>
                <p className="mt-2 text-sm text-[var(--ink-soft)]">{suggestion.why}</p>
                <p className="mt-2 text-sm text-[var(--accent-strong)]">{suggestion.fit}</p>
                {suggestion.tradeoffs.length ? (
                  <p className="mt-2 text-sm text-[var(--warning)]">Watch: {suggestion.tradeoffs.join(" ")}</p>
                ) : null}
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{suggestion.practicalNotes}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{result.caveat}</p>
    </div>
  );
}

function TripScreen({
  stops,
  activeStopId,
  options,
  onSelectStop,
  onSaveStop,
  onDeleteStop,
  onSaveOption,
  onDeleteOption,
}: {
  stops: TripStop[];
  activeStopId: string;
  options: TravelOption[];
  onSelectStop: (id: string) => void;
  onSaveStop: (stop: TripStop) => Promise<void>;
  onDeleteStop: (stopId: string) => Promise<void>;
  onSaveOption: (option: TravelOption) => Promise<void>;
  onDeleteOption: (optionId: string) => Promise<void>;
}) {
  const activeStop = stops.find((stop) => stop.id === activeStopId) ?? stops[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--accent)]">Stops</p>
            <h2 className="text-xl font-semibold">Trip backbone</h2>
          </div>
          <button
            className="focus-ring inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-white"
            onClick={() => onSaveStop(createBlankStop())}
          >
            <Plus size={16} />
            Add
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          {stops.map((stop) => (
            <button
              key={stop.id}
              className={`focus-ring rounded-lg border px-3 py-3 text-left ${
                stop.id === activeStop?.id
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--line)] bg-white"
              }`}
              onClick={() => onSelectStop(stop.id)}
            >
              <span className="block font-semibold">{stop.place || "Untitled stop"}</span>
              <span className="text-sm text-[var(--muted)]">{[stop.country, stop.startDate, stop.endDate].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
        </div>
      </section>

      {activeStop ? (
        <section className="grid gap-5">
          <StopEditor stop={activeStop} onSave={onSaveStop} onDelete={onDeleteStop} />
          <OptionEditor
            stop={activeStop}
            options={options.filter((option) => option.stopId === activeStop.id)}
            onSave={onSaveOption}
            onDelete={onDeleteOption}
          />
        </section>
      ) : null}
    </div>
  );
}

function StopEditor({
  stop,
  onSave,
  onDelete,
}: {
  stop: TripStop;
  onSave: (stop: TripStop) => Promise<void>;
  onDelete: (stopId: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(stop);

  useEffect(() => setDraft(stop), [stop]);

  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Stop details</h2>
        <button
          className="focus-ring inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 text-sm font-semibold text-[var(--danger)]"
          onClick={() => onDelete(stop.id)}
          aria-label="Delete stop"
        >
          <Trash2 size={16} />
          Delete
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <TextField label="Place" value={draft.place} onChange={(place) => setDraft({ ...draft, place })} />
        <TextField label="Country" value={draft.country} onChange={(country) => setDraft({ ...draft, country })} />
        <TextField label="Start date" type="date" value={draft.startDate} onChange={(startDate) => setDraft({ ...draft, startDate })} />
        <TextField label="End date" type="date" value={draft.endDate} onChange={(endDate) => setDraft({ ...draft, endDate })} />
        <TextField label="Latitude" type="number" value={draft.latitude?.toString() ?? ""} onChange={(latitude) => setDraft({ ...draft, latitude: optionalNumber(latitude) })} />
        <TextField label="Longitude" type="number" value={draft.longitude?.toString() ?? ""} onChange={(longitude) => setDraft({ ...draft, longitude: optionalNumber(longitude) })} />
        <TextArea label="Lodging notes" value={draft.lodgingNotes} onChange={(lodgingNotes) => setDraft({ ...draft, lodgingNotes })} />
        <TextArea label="Logistics notes" value={draft.logisticsNotes} onChange={(logisticsNotes) => setDraft({ ...draft, logisticsNotes })} />
        <TextArea label="Intentions" value={draft.intentions} onChange={(intentions) => setDraft({ ...draft, intentions })} />
      </div>
      <button
        className="focus-ring mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 font-semibold text-white"
        onClick={() => onSave({ ...draft, updatedAt: nowIso() })}
      >
        <Save size={17} />
        Save stop
      </button>
    </section>
  );
}

function OptionEditor({
  stop,
  options,
  onSave,
  onDelete,
}: {
  stop: TripStop;
  options: TravelOption[];
  onSave: (option: TravelOption) => Promise<void>;
  onDelete: (optionId: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<TravelOption>(() => createBlankOption(stop.id));

  useEffect(() => setDraft(createBlankOption(stop.id)), [stop.id]);

  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-[var(--accent)]">Plan + backlog</p>
        <h2 className="text-xl font-semibold">Options for {stop.place}</h2>
      </div>
      <div className="mt-4 grid gap-3">
        {options.map((option) => (
          <article key={option.id} className="rounded-lg border border-[var(--line)] bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{option.title}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {option.kind} · {option.durationMinutes} min · {option.energy} energy · priority {option.priority}
                </p>
              </div>
              <button
                className="focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--danger)]"
                onClick={() => onDelete(option.id)}
                aria-label={`Delete ${option.title}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
            {option.notes ? <p className="mt-2 text-sm text-[var(--ink-soft)]">{option.notes}</p> : null}
          </article>
        ))}
      </div>

      <div className="mt-5 rounded-lg border border-dashed border-[var(--line)] bg-white p-4">
        <h3 className="font-semibold">Add option</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <TextField label="Title" value={draft.title} onChange={(title) => setDraft({ ...draft, title })} />
          <SelectField<OptionKind>
            label="Kind"
            value={draft.kind}
            values={["activity", "meal", "rest", "backup", "logistics"]}
            onChange={(kind) => setDraft({ ...draft, kind })}
          />
          <TextField
            label="Duration minutes"
            type="number"
            value={String(draft.durationMinutes)}
            onChange={(durationMinutes) => setDraft({ ...draft, durationMinutes: Number(durationMinutes) })}
          />
          <SelectField<CostLevel>
            label="Cost"
            value={draft.cost}
            values={["free", "low", "medium", "high"]}
            onChange={(cost) => setDraft({ ...draft, cost })}
          />
          <SelectField<EnergyLevel>
            label="Energy"
            value={draft.energy}
            values={["low", "medium", "high"]}
            onChange={(energy) => setDraft({ ...draft, energy })}
          />
          <SelectField<WeatherSensitivity>
            label="Weather"
            value={draft.weatherSensitivity}
            values={["indoor", "mixed", "outdoor", "weather-proof"]}
            onChange={(weatherSensitivity) => setDraft({ ...draft, weatherSensitivity })}
          />
          <TextField label="Kid fit 1-10" type="number" value={String(draft.kidFit)} onChange={(kidFit) => setDraft({ ...draft, kidFit: clampNumber(kidFit) })} />
          <TextField label="Priority 1-10" type="number" value={String(draft.priority)} onChange={(priority) => setDraft({ ...draft, priority: clampNumber(priority) })} />
          <TextField label="Rarity 1-10" type="number" value={String(draft.rarity)} onChange={(rarity) => setDraft({ ...draft, rarity: clampNumber(rarity) })} />
          <TextField
            label="Logistics friction 1-10"
            type="number"
            value={String(draft.logisticsFriction)}
            onChange={(logisticsFriction) => setDraft({ ...draft, logisticsFriction: clampNumber(logisticsFriction) })}
          />
          <TextField label="Tags" value={draft.tags.join(", ")} onChange={(tags) => setDraft({ ...draft, tags: splitTags(tags) })} />
          <TextArea label="Notes" value={draft.notes} onChange={(notes) => setDraft({ ...draft, notes })} />
        </div>
        <button
          className="focus-ring mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 font-semibold text-white disabled:opacity-60"
          disabled={!draft.title.trim()}
          onClick={async () => {
            await onSave({ ...draft, title: draft.title.trim(), updatedAt: nowIso() });
            setDraft(createBlankOption(stop.id));
          }}
        >
          <Plus size={17} />
          Add to backlog
        </button>
      </div>
    </section>
  );
}

function ProfileScreen({ profile, onSave }: { profile: FamilyProfile; onSave: (profile: FamilyProfile) => Promise<void> }) {
  const [draft, setDraft] = useState(profile);

  useEffect(() => setDraft(profile), [profile]);

  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--accent)]">Family context</p>
          <h2 className="text-xl font-semibold">Decision preferences</h2>
        </div>
        <Users size={22} className="text-[var(--accent)]" />
      </div>
      <div className="mt-4 grid gap-3">
        <SelectField<PacePreference>
          label="Default pace"
          value={draft.pace}
          values={["slow", "balanced", "ambitious"]}
          onChange={(pace) => setDraft({ ...draft, pace })}
        />
        <TextArea label="Food preferences" value={draft.foodPreferences} onChange={(foodPreferences) => setDraft({ ...draft, foodPreferences })} />
        <TextArea label="Constraints" value={draft.constraints} onChange={(constraints) => setDraft({ ...draft, constraints })} />
        <TextArea label="Must avoid" value={draft.mustAvoid} onChange={(mustAvoid) => setDraft({ ...draft, mustAvoid })} />
        <div className="rounded-lg border border-[var(--line)] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">Travellers</h3>
            <button
              className="focus-ring inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--line)] px-3 text-sm font-semibold"
              onClick={() =>
                setDraft({
                  ...draft,
                  travellers: [...draft.travellers, { id: makeId("traveller"), name: "", needs: "" }],
                })
              }
            >
              <Plus size={15} />
              Add
            </button>
          </div>
          <div className="mt-3 grid gap-3">
            {draft.travellers.map((traveller) => (
              <div key={traveller.id} className="grid gap-2 rounded-lg border border-[var(--line)] p-3 sm:grid-cols-[1fr_90px_1.4fr_auto]">
                <TextField
                  label="Name"
                  value={traveller.name}
                  onChange={(name) =>
                    setDraft({
                      ...draft,
                      travellers: draft.travellers.map((item) => (item.id === traveller.id ? { ...item, name } : item)),
                    })
                  }
                />
                <TextField
                  label="Age"
                  type="number"
                  value={traveller.age?.toString() ?? ""}
                  onChange={(age) =>
                    setDraft({
                      ...draft,
                      travellers: draft.travellers.map((item) => (item.id === traveller.id ? { ...item, age: optionalNumber(age) } : item)),
                    })
                  }
                />
                <TextField
                  label="Needs"
                  value={traveller.needs}
                  onChange={(needs) =>
                    setDraft({
                      ...draft,
                      travellers: draft.travellers.map((item) => (item.id === traveller.id ? { ...item, needs } : item)),
                    })
                  }
                />
                <button
                  className="focus-ring mt-6 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--danger)]"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      travellers: draft.travellers.filter((item) => item.id !== traveller.id),
                    })
                  }
                  aria-label={`Remove ${traveller.name || "traveller"}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <button
        className="focus-ring mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 font-semibold text-white"
        onClick={() => onSave({ ...draft, updatedAt: nowIso() })}
      >
        <Save size={17} />
        Save profile
      </button>
    </section>
  );
}

function DataScreen({
  runs,
  trips,
  activeTripId,
  onExport,
  onImport,
  onItineraryImport,
  onSwitchTrip,
  onCreateTrip,
  onInvite,
}: {
  runs: RecommendationRun[];
  trips: TripSummary[];
  activeTripId: string;
  onExport: () => Promise<void>;
  onImport: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onItineraryImport: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onSwitchTrip: (tripId: string) => Promise<void>;
  onCreateTrip: (name: string) => Promise<void>;
  onInvite: (email: string, role: "editor" | "viewer") => Promise<void>;
}) {
  const [newTripName, setNewTripName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const activeTrip = trips.find((trip) => trip.id === activeTripId);

  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
        <p className="text-sm font-semibold text-[var(--accent)]">Trips</p>
        <h2 className="text-xl font-semibold">Access and sharing</h2>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-2">
            <span className="text-sm font-medium">Current trip</span>
            <select
              className="focus-ring h-11 rounded-lg border border-[var(--line)] bg-white px-3"
              value={activeTripId}
              onChange={(event) => onSwitchTrip(event.target.value)}
            >
              {trips.map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.name} ({trip.role})
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <TextField label="New trip name" value={newTripName} onChange={setNewTripName} />
            <button
              className="focus-ring mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 font-semibold text-white disabled:opacity-60"
              disabled={!newTripName.trim()}
              onClick={async () => {
                await onCreateTrip(newTripName);
                setNewTripName("");
              }}
            >
              <Plus size={17} />
              Create
            </button>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-white p-3">
            <p className="text-sm font-semibold">Invite someone</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_110px_auto]">
              <input
                className="focus-ring h-11 rounded-lg border border-[var(--line)] bg-white px-3"
                type="email"
                placeholder="email@example.com"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
              />
              <select
                className="focus-ring h-11 rounded-lg border border-[var(--line)] bg-white px-3"
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as "editor" | "viewer")}
              >
                <option value="editor">editor</option>
                <option value="viewer">viewer</option>
              </select>
              <button
                className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--foreground)] px-4 font-semibold text-white disabled:opacity-60"
                disabled={!inviteEmail.trim() || !activeTrip}
                onClick={async () => {
                  await onInvite(inviteEmail, inviteRole);
                  setInviteEmail("");
                }}
              >
                Invite
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              Invited people get access when they sign in with the same email. Editors can change the trip; viewers can open it read-only.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
        <p className="text-sm font-semibold text-[var(--accent)]">Trip data</p>
        <h2 className="text-xl font-semibold">Imports and backups</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Bring in itinerary rows from a spreadsheet, or export a JSON backup copy of your cloud trip data.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button className="focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 font-semibold text-white" onClick={onExport}>
            <Download size={18} />
            Export JSON
          </button>
          <label className="focus-ring inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-white px-4 font-semibold">
            <Upload size={18} />
            Import JSON
            <input className="sr-only" type="file" accept="application/json" onChange={onImport} />
          </label>
          <label className="focus-ring inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-white px-4 font-semibold sm:col-span-2">
            <Upload size={18} />
            Import itinerary CSV
            <input className="sr-only" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={onItineraryImport} />
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--accent)]">History</p>
            <h2 className="text-xl font-semibold">Recent runs</h2>
          </div>
          <CalendarDays size={22} className="text-[var(--accent)]" />
        </div>
        <div className="mt-4 grid gap-3">
          {runs.slice(0, 8).map((run) => (
            <article key={run.id} className="rounded-lg border border-[var(--line)] bg-white p-3">
              <p className="font-mono text-xs text-[var(--muted)]">{run.date} · {new Date(run.generatedAt).toLocaleString()}</p>
              <p className="mt-2 text-sm text-[var(--ink-soft)]">{run.summary}</p>
            </article>
          ))}
          {runs.length === 0 ? <p className="text-sm text-[var(--muted)]">No recommendation runs yet.</p> : null}
        </div>
      </section>
    </div>
  );
}

function Slider({
  label,
  value,
  lowLabel,
  highLabel,
  onChange,
}: {
  label: string;
  value: number;
  lowLabel: string;
  highLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="flex items-center justify-between gap-3 text-sm font-medium">
        <span>{label}</span>
        <span className="rounded-full bg-white px-2 py-1 font-mono text-xs">{value}/10</span>
      </span>
      <input className="w-full" type="range" min="1" max="10" value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <span className="flex justify-between text-xs text-[var(--muted)]">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </span>
    </label>
  );
}

function TabButton({
  tab,
  active,
  onClick,
  compact = false,
}: {
  tab: { id: TabId; label: string; icon: typeof Gauge };
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const Icon = tab.icon;
  return (
    <button
      className={`focus-ring inline-flex items-center justify-center gap-2 rounded-lg px-3 font-semibold ${
        compact ? "h-12 flex-col gap-1 text-[11px]" : "h-11 text-sm"
      } ${active ? "bg-[var(--foreground)] text-white" : "text-[var(--muted)]"}`}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={compact ? 17 : 16} />
      {tab.label}
    </button>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
          <Icon size={18} />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
          <p className="mt-1 font-semibold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <input
        className="focus-ring h-11 rounded-lg border border-[var(--line)] bg-white px-3"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 sm:col-span-2">
      <span className="text-sm font-medium">{label}</span>
      <textarea
        className="focus-ring min-h-24 resize-y rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: T;
  values: T[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <select
        className="focus-ring h-11 rounded-lg border border-[var(--line)] bg-white px-3"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {values.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}

function pickCurrentStop(stops: TripStop[]) {
  const today = todayIso();
  return stops.find((stop) => stop.startDate <= today && (!stop.endDate || stop.endDate >= today));
}

function findMergedStopId(stops: TripStop[], importedStop?: TripStop) {
  if (!importedStop) return undefined;
  return stops.find(
    (stop) =>
      stop.place.trim().toLowerCase() === importedStop.place.trim().toLowerCase() &&
      stop.country.trim().toLowerCase() === importedStop.country.trim().toLowerCase() &&
      stop.startDate === importedStop.startDate &&
      stop.endDate === importedStop.endDate,
  )?.id;
}

function makeTravelData({
  familyProfile,
  stops,
  options,
  checkIns,
  recommendationRuns,
}: {
  familyProfile: FamilyProfile;
  stops: TripStop[];
  options: TravelOption[];
  checkIns: DailyCheckIn[];
  recommendationRuns: RecommendationRun[];
}): TravelDataExport {
  return {
    version: 1,
    exportedAt: nowIso(),
    familyProfile,
    stops,
    options,
    checkIns,
    recommendationRuns,
  };
}

function makeBlankTravelData(): TravelDataExport {
  return makeTravelData({
    familyProfile: {
      ...createDefaultFamilyProfile(),
      travellers: [],
      foodPreferences: "",
      constraints: "",
      mustAvoid: "",
    },
    stops: [],
    options: [],
    checkIns: [],
    recommendationRuns: [],
  });
}

async function saveCloudTravelData(tripId: string, data: TravelDataExport) {
  await fetchJson<{ ok: true }>(`/api/travel-data?tripId=${encodeURIComponent(tripId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, exportedAt: nowIso() }),
  });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed: ${response.status}`);
  }
  return payload as T;
}

function upsert<T extends { id: string }>(items: T[], item: T) {
  return items.some((existing) => existing.id === item.id)
    ? items.map((existing) => (existing.id === item.id ? item : existing))
    : [...items, item];
}

function createBlankStop(): TripStop {
  const now = nowIso();
  return {
    id: makeId("stop"),
    place: "",
    country: "",
    startDate: todayIso(),
    endDate: "",
    lodgingNotes: "",
    logisticsNotes: "",
    intentions: "",
    createdAt: now,
    updatedAt: now,
  };
}

function createBlankOption(stopId: string): TravelOption {
  const now = nowIso();
  return {
    id: makeId("option"),
    stopId,
    title: "",
    kind: "activity",
    notes: "",
    durationMinutes: 180,
    cost: "medium",
    energy: "medium",
    weatherSensitivity: "mixed",
    kidFit: 7,
    priority: 6,
    rarity: 5,
    logisticsFriction: 4,
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

function optionalNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && value.trim() !== "" ? number : undefined;
}

function clampNumber(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(10, number));
}

function splitTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function weatherLabel(weather: WeatherSummary, loading: boolean) {
  if (loading) return "Updating";
  if (weather.status === "available") return `${weather.condition ?? "Mixed"} · ${weather.temperatureC ?? "?"}C`;
  return "Unknown";
}

function weatherDetail(weather: WeatherSummary) {
  if (weather.status === "unknown") return weather.message ?? "Unknown";
  return [
    weather.condition,
    weather.temperatureC !== undefined ? `${weather.temperatureC}C` : undefined,
    weather.precipitationProbability !== undefined ? `${weather.precipitationProbability}% rain risk` : undefined,
    weather.windKph !== undefined ? `${weather.windKph} kph wind` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}
