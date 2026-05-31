import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { inviteToTrip } from "@/lib/trips-db";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { tripId, email, role } = (await request.json()) as {
      tripId?: string;
      email?: string;
      role?: "editor" | "viewer";
    };

    if (!tripId || !email) {
      return NextResponse.json({ error: "Trip and email are required." }, { status: 400 });
    }

    await inviteToTrip({ tripId, invitedBy: user.id, email, role: role ?? "editor" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not invite user";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
