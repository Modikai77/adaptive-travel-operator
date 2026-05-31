import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getTravelData, saveTravelData } from "@/lib/travel-data-db";
import { ensureTripAccess } from "@/lib/trips-db";
import type { TravelDataExport } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const tripId = new URL(request.url).searchParams.get("tripId");
    if (!tripId) return NextResponse.json({ error: "tripId is required." }, { status: 400 });
    await ensureTripAccess(user.id, tripId);
    const data = await getTravelData(tripId);
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const tripId = new URL(request.url).searchParams.get("tripId");
    if (!tripId) return NextResponse.json({ error: "tripId is required." }, { status: 400 });
    await ensureTripAccess(user.id, tripId, ["owner", "editor"]);
    const data = (await request.json()) as TravelDataExport;
    if (data.version !== 1 || !data.familyProfile || !Array.isArray(data.stops)) {
      return NextResponse.json({ error: "Invalid travel data." }, { status: 400 });
    }

    await saveTravelData(tripId, data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
