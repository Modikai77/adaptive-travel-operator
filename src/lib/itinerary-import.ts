import { makeId, nowIso } from "./seed";
import type {
  CostLevel,
  EnergyLevel,
  OptionKind,
  TravelOption,
  TripStop,
  WeatherSensitivity,
} from "./types";

export interface ItineraryImportResult {
  stops: TripStop[];
  options: TravelOption[];
  skippedRows: number;
  totalRows: number;
  detectedHeaders: string[];
}

type CsvRow = Record<string, string>;

const stopHeaderAliases = {
  place: ["place", "city", "stop", "location", "destination", "destinationstop", "placecity", "citystop", "base", "where"],
  country: ["country", "nation"],
  startDate: ["startdate", "start", "date", "arrival", "arrivedate", "from", "datefrom", "checkin", "checkindate"],
  endDate: ["enddate", "end", "departure", "departuredate", "to", "dateto", "checkout", "checkoutdate"],
  lodgingNotes: ["lodgingnotes", "lodging", "hotel", "accommodation", "stay", "accomodation", "wherewestay"],
  logisticsNotes: ["logisticsnotes", "logistics", "transport", "transit", "travelnotes"],
  intentions: ["intentions", "intent", "goals", "theme", "notes", "stopnotes", "purpose"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lng", "lon", "long"],
};

const optionHeaderAliases = {
  title: ["optiontitle", "activity", "activitytitle", "option", "thingtodo", "todo", "restaurant", "meal", "title", "plan", "plannedactivity", "idea", "experience"],
  kind: ["optionkind", "kind", "type", "category"],
  notes: ["optionnotes", "activitynotes", "description", "details"],
  durationMinutes: ["durationminutes", "durationmins", "duration", "minutes"],
  cost: ["cost", "costlevel", "price"],
  energy: ["energy", "energylevel", "effort"],
  weatherSensitivity: ["weathersensitivity", "weather", "indooroutdoor"],
  kidFit: ["kidfit", "kids", "familyfit", "childfit"],
  priority: ["priority", "importance", "mustdo"],
  rarity: ["rarity", "uniqueness"],
  logisticsFriction: ["logisticsfriction", "friction", "difficulty"],
  tags: ["tags", "tag"],
};

export function parseItineraryCsv(text: string): ItineraryImportResult {
  const rows = parseDelimited(text);
  if (rows.length < 2) return emptyResult(rows);

  const headerIndex = findHeaderRowIndex(rows);
  if (headerIndex === -1) return emptyResult(rows);

  const headers = rows[headerIndex].map(normalizeHeader);
  const groupedHeaders = buildGroupedHeaders(rows[headerIndex - 1] ?? [], rows[headerIndex]);
  const dataRows = rows.slice(headerIndex + 1);
  const stopByKey = new Map<string, TripStop>();
  const options: TravelOption[] = [];
  let skippedRows = headerIndex;

  for (const values of dataRows) {
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
    const place = readAlias(row, stopHeaderAliases.place);
    const country = readAlias(row, stopHeaderAliases.country);
    const title = readAlias(row, optionHeaderAliases.title);

    if (!place && !title) {
      skippedRows += 1;
      continue;
    }

    if (!place) {
      skippedRows += 1;
      continue;
    }

    const stopKey = [
      place,
      country,
      readAlias(row, stopHeaderAliases.startDate),
      readAlias(row, stopHeaderAliases.endDate),
    ]
      .map((value) => value.toLowerCase())
      .join("|");

    let stop = stopByKey.get(stopKey);
    if (!stop) {
      stop = createStopFromRow(row, place, country);
      stopByKey.set(stopKey, stop);
    }

    if (title) {
      options.push(createOptionFromRow(row, stop.id, title));
    }

    options.push(...createGroupedOptionsFromRow(values, groupedHeaders, stop.id));
  }

  return {
    stops: Array.from(stopByKey.values()),
    options,
    skippedRows,
    totalRows: rows.length,
    detectedHeaders: rows[headerIndex],
  };
}

export function mergeImportedItinerary({
  existingStops,
  existingOptions,
  imported,
}: {
  existingStops: TripStop[];
  existingOptions: TravelOption[];
  imported: ItineraryImportResult;
}) {
  const stops = [...existingStops];
  const options = [...existingOptions];
  const importedToStoredStopId = new Map<string, string>();

  for (const importedStop of imported.stops) {
    const existing = stops.find((stop) => stopIdentity(stop) === stopIdentity(importedStop));
    if (existing) {
      importedToStoredStopId.set(importedStop.id, existing.id);
      stops[stops.findIndex((stop) => stop.id === existing.id)] = {
        ...existing,
        lodgingNotes: importedStop.lodgingNotes || existing.lodgingNotes,
        logisticsNotes: importedStop.logisticsNotes || existing.logisticsNotes,
        intentions: importedStop.intentions || existing.intentions,
        latitude: importedStop.latitude ?? existing.latitude,
        longitude: importedStop.longitude ?? existing.longitude,
        updatedAt: nowIso(),
      };
    } else {
      importedToStoredStopId.set(importedStop.id, importedStop.id);
      stops.push(importedStop);
    }
  }

  for (const importedOption of imported.options) {
    const stopId = importedToStoredStopId.get(importedOption.stopId);
    if (!stopId) continue;
    const option = { ...importedOption, stopId };
    const duplicate = options.some(
      (existing) =>
        existing.stopId === option.stopId &&
        existing.title.trim().toLowerCase() === option.title.trim().toLowerCase(),
    );
    if (!duplicate) options.push(option);
  }

  return { stops, options };
}

function createStopFromRow(row: CsvRow, place: string, country: string): TripStop {
  const now = nowIso();
  return {
    id: makeId("stop"),
    place,
    country,
    startDate: normalizeDate(readAlias(row, stopHeaderAliases.startDate)),
    endDate: normalizeDate(readAlias(row, stopHeaderAliases.endDate)),
    lodgingNotes: readAlias(row, stopHeaderAliases.lodgingNotes),
    logisticsNotes: readAlias(row, stopHeaderAliases.logisticsNotes),
    intentions: readAlias(row, stopHeaderAliases.intentions),
    latitude: optionalNumber(readAlias(row, stopHeaderAliases.latitude)),
    longitude: optionalNumber(readAlias(row, stopHeaderAliases.longitude)),
    createdAt: now,
    updatedAt: now,
  };
}

function createGroupedOptionsFromRow(values: string[], groupedHeaders: GroupedHeader[], stopId: string) {
  return groupedHeaders.flatMap((header, index) => {
    const title = values[index]?.trim();
    if (!title || !header.group) return [];

    const group = header.group.toLowerCase();
    const kind: OptionKind = group.includes("restaurant") || group.includes("food") || group.includes("meal")
      ? "meal"
      : group.includes("backup")
        ? "backup"
        : group.includes("logistic") || group.includes("transport")
          ? "logistics"
          : "activity";

    const now = nowIso();
    return [
      {
        id: makeId("option"),
        stopId,
        title,
        kind,
        notes: `${header.group}${header.label ? ` ${header.label}` : ""}`,
        durationMinutes: kind === "meal" ? 90 : 180,
        cost: "medium" as CostLevel,
        energy: kind === "meal" ? ("low" as EnergyLevel) : ("medium" as EnergyLevel),
        weatherSensitivity: parseWeather("", title, header.group),
        kidFit: 7,
        priority: 6,
        rarity: 5,
        logisticsFriction: 4,
        tags: [header.group.toLowerCase()],
        createdAt: now,
        updatedAt: now,
      },
    ];
  });
}

function createOptionFromRow(row: CsvRow, stopId: string, title: string): TravelOption {
  const now = nowIso();
  const notes = readAlias(row, optionHeaderAliases.notes);
  return {
    id: makeId("option"),
    stopId,
    title,
    kind: parseOptionKind(readAlias(row, optionHeaderAliases.kind), title),
    notes,
    durationMinutes: parseDurationMinutes(readAlias(row, optionHeaderAliases.durationMinutes)) ?? 180,
    cost: parseCost(readAlias(row, optionHeaderAliases.cost)),
    energy: parseEnergy(readAlias(row, optionHeaderAliases.energy)),
    weatherSensitivity: parseWeather(readAlias(row, optionHeaderAliases.weatherSensitivity), title, notes),
    kidFit: boundedScore(readAlias(row, optionHeaderAliases.kidFit), 7),
    priority: boundedScore(readAlias(row, optionHeaderAliases.priority), 6),
    rarity: boundedScore(readAlias(row, optionHeaderAliases.rarity), 5),
    logisticsFriction: boundedScore(readAlias(row, optionHeaderAliases.logisticsFriction), 4),
    tags: splitTags(readAlias(row, optionHeaderAliases.tags)),
    createdAt: now,
    updatedAt: now,
  };
}

function parseDelimited(text: string): string[][] {
  const delimiter = firstNonEmptyLine(text).includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function firstNonEmptyLine(text: string) {
  return text.split(/\r?\n/).find((line) => line.trim()) ?? "";
}

function emptyResult(rows: string[][]): ItineraryImportResult {
  return {
    stops: [],
    options: [],
    skippedRows: rows.length,
    totalRows: rows.length,
    detectedHeaders: rows[0] ?? [],
  };
}

function findHeaderRowIndex(rows: string[][]) {
  let bestIndex = -1;
  let bestScore = 0;

  rows.slice(0, 10).forEach((row, index) => {
    const headers = row.map(normalizeHeader);
    const score =
      matchCount(headers, stopHeaderAliases.place) * 3 +
      matchCount(headers, stopHeaderAliases.country) +
      matchCount(headers, stopHeaderAliases.startDate) +
      matchCount(headers, optionHeaderAliases.title) * 2;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestScore >= 3 ? bestIndex : -1;
}

function matchCount(headers: string[], aliases: string[]) {
  return headers.filter((header) => aliases.includes(header)).length;
}

interface GroupedHeader {
  group: string;
  label: string;
}

function buildGroupedHeaders(groupRow: string[], headerRow: string[]): GroupedHeader[] {
  let currentGroup = "";

  return headerRow.map((header, index) => {
    const explicitGroup = groupRow[index]?.trim();
    if (explicitGroup) currentGroup = explicitGroup;

    const label = header?.trim() ?? "";
    const normalizedGroup = normalizeHeader(currentGroup);
    const normalizedLabel = normalizeHeader(label);
    const isRegularStopColumn = [
      ...stopHeaderAliases.place,
      ...stopHeaderAliases.country,
      ...stopHeaderAliases.startDate,
      ...stopHeaderAliases.endDate,
      ...stopHeaderAliases.lodgingNotes,
      ...stopHeaderAliases.logisticsNotes,
      ...stopHeaderAliases.intentions,
      ...stopHeaderAliases.latitude,
      ...stopHeaderAliases.longitude,
      ...optionHeaderAliases.title,
      ...optionHeaderAliases.kind,
      ...optionHeaderAliases.notes,
      ...optionHeaderAliases.durationMinutes,
      ...optionHeaderAliases.cost,
      ...optionHeaderAliases.energy,
      ...optionHeaderAliases.weatherSensitivity,
      ...optionHeaderAliases.kidFit,
      ...optionHeaderAliases.priority,
      ...optionHeaderAliases.rarity,
      ...optionHeaderAliases.logisticsFriction,
      ...optionHeaderAliases.tags,
    ].includes(normalizedLabel);

    const isOptionGroup =
      normalizedGroup.includes("activit") ||
      normalizedGroup.includes("restaurant") ||
      normalizedGroup.includes("meal") ||
      normalizedGroup.includes("food") ||
      normalizedGroup.includes("backup") ||
      normalizedGroup.includes("logistic") ||
      normalizedGroup.includes("transport");

    return {
      group: isOptionGroup && !isRegularStopColumn ? currentGroup : "",
      label,
    };
  });
}

function readAlias(row: CsvRow, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[alias];
    if (value) return value.trim();
  }
  return "";
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stopIdentity(stop: TripStop) {
  return [stop.place, stop.country, stop.startDate, stop.endDate]
    .map((value) => value.trim().toLowerCase())
    .join("|");
}

function optionalNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && value.trim() !== "" ? number : undefined;
}

function normalizeDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const slashDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDate) {
    const first = Number(slashDate[1]);
    const second = Number(slashDate[2]);
    const year = slashDate[3];
    const day = first > 12 ? first : first;
    const month = second;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return trimmed;
}

function parseDurationMinutes(value: string) {
  const direct = optionalNumber(value);
  if (direct !== undefined) return direct;

  const normalized = value.toLowerCase();
  const hours = normalized.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)/);
  const minutes = normalized.match(/(\d+)\s*(m|min|mins|minute|minutes)/);
  const total =
    (hours ? Number(hours[1]) * 60 : 0) +
    (minutes ? Number(minutes[1]) : 0);

  return total > 0 ? Math.round(total) : undefined;
}

function boundedScore(value: string, fallback: number) {
  const number = optionalNumber(value);
  if (number === undefined) return fallback;
  return Math.max(1, Math.min(10, Math.round(number)));
}

function splitTags(value: string) {
  return value
    .split(/[;,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseOptionKind(value: string, title: string): OptionKind {
  const normalized = `${value} ${title}`.toLowerCase();
  if (normalized.includes("meal") || normalized.includes("restaurant") || normalized.includes("lunch") || normalized.includes("dinner")) return "meal";
  if (normalized.includes("rest") || normalized.includes("recovery") || normalized.includes("downtime")) return "rest";
  if (normalized.includes("backup") || normalized.includes("rain")) return "backup";
  if (normalized.includes("logistic") || normalized.includes("transit") || normalized.includes("transfer")) return "logistics";
  return "activity";
}

function parseCost(value: string): CostLevel {
  const normalized = value.toLowerCase();
  if (["free", "low", "medium", "high"].includes(normalized)) return normalized as CostLevel;
  if (normalized.includes("£££") || normalized.includes("$$$") || normalized.includes("expensive")) return "high";
  if (normalized.includes("££") || normalized.includes("$$")) return "medium";
  if (normalized.includes("free")) return "free";
  if (normalized.includes("£") || normalized.includes("$") || normalized.includes("cheap") || normalized.includes("low")) return "low";
  return "medium";
}

function parseEnergy(value: string): EnergyLevel {
  const normalized = value.toLowerCase();
  if (normalized.includes("high") || normalized.includes("hard")) return "high";
  if (normalized.includes("low") || normalized.includes("easy")) return "low";
  return "medium";
}

function parseWeather(value: string, title: string, notes: string): WeatherSensitivity {
  const normalized = `${value} ${title} ${notes}`.toLowerCase();
  if (normalized.includes("weather-proof") || normalized.includes("weatherproof")) return "weather-proof";
  if (normalized.includes("indoor") || normalized.includes("museum") || normalized.includes("gallery")) return "indoor";
  if (normalized.includes("outdoor") || normalized.includes("park") || normalized.includes("walk") || normalized.includes("hike")) return "outdoor";
  return "mixed";
}
