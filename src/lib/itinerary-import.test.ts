import { describe, expect, it } from "vitest";
import { mergeImportedItinerary, parseItineraryCsv } from "./itinerary-import";

describe("parseItineraryCsv", () => {
  it("imports stop rows with repeated option rows from a Google Sheet style CSV", () => {
    const csv = [
      "Date,City,Country,Hotel,Activity,Type,Duration,Cost,Energy,Weather,Kid Fit,Priority,Tags",
      "2026-09-01,Mexico City,Mexico,Roma Norte apartment,National Museum of Anthropology,activity,3h,medium,medium,indoor,8,9,museum;culture",
      "2026-09-01,Mexico City,Mexico,Roma Norte apartment,Contramar lunch,meal,90 min,high,low,mixed,7,8,food",
      "2026-09-05,Oaxaca,Mexico,Centro hotel,,,,,,,,",
    ].join("\n");

    const imported = parseItineraryCsv(csv);

    expect(imported.stops).toHaveLength(2);
    expect(imported.options).toHaveLength(2);
    expect(imported.stops[0].place).toBe("Mexico City");
    expect(imported.stops[0].lodgingNotes).toBe("Roma Norte apartment");
    expect(imported.options[0]).toMatchObject({
      title: "National Museum of Anthropology",
      durationMinutes: 180,
      weatherSensitivity: "indoor",
      kidFit: 8,
      priority: 9,
      tags: ["museum", "culture"],
    });
  });

  it("handles quoted commas and merges duplicate stops without duplicate options", () => {
    const imported = parseItineraryCsv([
      "start_date,place,country,option_title,option_notes",
      '2026-10-01,"Tokyo, central",Japan,"Ueno Park","Easy wander, museums nearby"',
    ].join("\n"));
    const merged = mergeImportedItinerary({
      existingStops: [imported.stops[0]],
      existingOptions: [imported.options[0]],
      imported,
    });

    expect(imported.stops[0].place).toBe("Tokyo, central");
    expect(imported.options[0].notes).toBe("Easy wander, museums nearby");
    expect(merged.stops).toHaveLength(1);
    expect(merged.options).toHaveLength(1);
  });

  it("detects headers below title rows and supports combined destination headers", () => {
    const csv = [
      "Family world trip 2026",
      "Draft itinerary export",
      "Start Date,Destination / Stop,Nation,Where we stay,Planned activity",
      "2026-11-02,Lima,Peru,Miraflores apartment,Food tour",
    ].join("\n");

    const imported = parseItineraryCsv(csv);

    expect(imported.stops).toHaveLength(1);
    expect(imported.options).toHaveLength(1);
    expect(imported.skippedRows).toBe(2);
    expect(imported.stops[0]).toMatchObject({
      place: "Lima",
      country: "Peru",
      lodgingNotes: "Miraflores apartment",
    });
  });

  it("imports grouped activity and restaurant columns from the world trip sheet shape", () => {
    const csv = [
      ",,,Activities,,,Restaurants,,",
      "Date,Location,Country,1,2,3,1,2,3",
      "11/11/2026,Cape Town,South Africa,Table top mountain,See penguins,,Arnolds Restaurant,The Woodlands Eatery,",
      "15/11/2026,Stellensbosch,South Africa,Wine tasting,Hike in vineyards,Bicycle around vineyards,De Vier,La Pineta,",
    ].join("\n");

    const imported = parseItineraryCsv(csv);

    expect(imported.stops).toHaveLength(2);
    expect(imported.stops[0]).toMatchObject({
      place: "Cape Town",
      country: "South Africa",
      startDate: "2026-11-11",
    });
    expect(imported.options.map((option) => option.title)).toEqual([
      "Table top mountain",
      "See penguins",
      "Arnolds Restaurant",
      "The Woodlands Eatery",
      "Wine tasting",
      "Hike in vineyards",
      "Bicycle around vineyards",
      "De Vier",
      "La Pineta",
    ]);
    expect(imported.options.filter((option) => option.kind === "meal")).toHaveLength(4);
  });
});
