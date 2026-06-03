import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { archiveTrip, deleteTrip, restoreTrip } from "@/lib/trips-db";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { tripId, action } = (await request.json()) as {
      tripId?: string;
      action?: "archive" | "delete" | "restore";
    };

    if (!tripId || !action) {
      return NextResponse.json({ error: "Trip and action are required." }, { status: 400 });
    }

    if (action === "archive") {
      await archiveTrip(user.id, tripId);
      return NextResponse.json({ ok: true });
    }

    if (action === "delete") {
      await deleteTrip(user.id, tripId);
      return NextResponse.json({ ok: true });
    }

    if (action === "restore") {
      await restoreTrip(user.id, tripId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported trip action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update trip";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
