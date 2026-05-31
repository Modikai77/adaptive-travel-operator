import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createTrip, listTrips } from "@/lib/trips-db";

export async function GET() {
  try {
    const user = await requireUser();
    const trips = await listTrips(user.id, user.email);
    return NextResponse.json({ trips });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { name } = (await request.json()) as { name?: string };
    const trip = await createTrip(user.id, name ?? "World Trip");
    return NextResponse.json({ trip });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create trip";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
