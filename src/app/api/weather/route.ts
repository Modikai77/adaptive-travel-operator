import { NextRequest, NextResponse } from "next/server";
import type { WeatherSummary } from "@/lib/types";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const place = searchParams.get("place") ?? "";
  const country = searchParams.get("country") ?? "";
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));

  try {
    const coordinates =
      Number.isFinite(lat) && Number.isFinite(lon)
        ? { latitude: lat, longitude: lon, name: place || "Current stop" }
        : await geocode(`${place} ${country}`.trim());

    if (!coordinates) {
      return NextResponse.json<WeatherSummary>({
        status: "unknown",
        message: "Could not resolve this stop for weather.",
      });
    }

    const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
    forecastUrl.searchParams.set("latitude", String(coordinates.latitude));
    forecastUrl.searchParams.set("longitude", String(coordinates.longitude));
    forecastUrl.searchParams.set("current", "temperature_2m,precipitation,weather_code,wind_speed_10m");
    forecastUrl.searchParams.set("hourly", "precipitation_probability");
    forecastUrl.searchParams.set("forecast_days", "1");
    forecastUrl.searchParams.set("timezone", "auto");

    const response = await fetch(forecastUrl, { next: { revalidate: 900 } });
    if (!response.ok) throw new Error("Weather provider failed");
    const json = await response.json();

    const probabilities = Array.isArray(json.hourly?.precipitation_probability)
      ? json.hourly.precipitation_probability.filter((value: unknown) => typeof value === "number")
      : [];
    const precipitationProbability = probabilities.length
      ? Math.round(Math.max(...probabilities.slice(0, 12)))
      : undefined;

    return NextResponse.json<WeatherSummary>({
      status: "available",
      locationName: coordinates.name,
      temperatureC: json.current?.temperature_2m,
      precipitationProbability,
      windKph: json.current?.wind_speed_10m,
      condition: describeWeatherCode(json.current?.weather_code),
      source: "Open-Meteo",
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json<WeatherSummary>({
      status: "unknown",
      message: "Weather is unavailable right now. The operator can still use your manual state.",
    });
  }
}

async function geocode(query: string): Promise<{ latitude: number; longitude: number; name: string } | null> {
  if (!query) return null;
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const response = await fetch(url, { next: { revalidate: 86400 } });
  if (!response.ok) return null;
  const json = await response.json();
  const first = json.results?.[0];
  if (!first) return null;
  return {
    latitude: first.latitude,
    longitude: first.longitude,
    name: [first.name, first.country].filter(Boolean).join(", "),
  };
}

function describeWeatherCode(code: number | undefined) {
  if (code === undefined) return "Unknown";
  if (code === 0) return "Clear";
  if ([1, 2, 3].includes(code)) return "Partly cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Mixed";
}
