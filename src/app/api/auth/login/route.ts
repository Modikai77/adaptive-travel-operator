import { NextResponse } from "next/server";
import { createSession, findUserByEmail, verifyPassword } from "@/lib/auth";
import { applyPendingInvitations } from "@/lib/trips-db";

export async function POST(request: Request) {
  const { email, password } = (await request.json()) as { email?: string; password?: string };
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password, user)) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  await applyPendingInvitations(user.id, user.email);
  await createSession(user.id);
  return NextResponse.json({ user: { id: user.id, email: user.email } });
}
