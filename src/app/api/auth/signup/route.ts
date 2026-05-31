import { NextResponse } from "next/server";
import { createSession, createUser } from "@/lib/auth";
import { applyPendingInvitations } from "@/lib/trips-db";

export async function POST(request: Request) {
  try {
    const { email, password } = (await request.json()) as { email?: string; password?: string };
    if (!email || !password || password.length < 8) {
      return NextResponse.json({ error: "Use an email and a password of at least 8 characters." }, { status: 400 });
    }

    const user = await createUser(email, password);
    await applyPendingInvitations(user.id, user.email);
    await createSession(user.id);
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Could not create account. The email may already be in use." }, { status: 400 });
  }
}
